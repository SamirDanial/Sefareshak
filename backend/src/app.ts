import express, { Application, Request, Response, NextFunction } from "express";
import { createServer, Server as HTTPServer } from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { existsSync } from "fs";
import DatabaseSingleton from "./config/database";
import ClerkSingleton from "./config/clerk";
import { verifyToken } from "@clerk/clerk-sdk-node";
import AdminRoutes from "./routes/admin";
import UserRoutes from "./routes/user";
import WebhookRoutes from "./routes/webhook";
import PaymentRoutes from "./routes/payment";
import OrderRoutes from "./routes/order";
import DashboardRoutes from "./routes/dashboard";
import CategoryInsightsRoutes from "./routes/categoryInsights";
import CategoryRoutes from "./routes/category";
import UploadRoutes from "./routes/upload";
import AddonRoutes from "./routes/addon";
import MealRoutes from "./routes/meal";
import DealRoutes from "./routes/deal";
import RefundRoutes from "./routes/refund";
import NotificationRoutes from "./routes/notification";
import PushNotificationRoutes from "./routes/pushNotifications";
import AdminPushNotificationRoutes from "./routes/adminPushNotifications";
import SubscriptionRoutes from "./routes/subscriptions";
import OrganizationPushNotificationRoutes from "./routes/organizationPushNotifications";
import TabletNotificationPreferencesRoutes from "./routes/tabletNotificationPreferences";
import DeclarationRoutes from "./routes/declaration";
import OptionalIngredientRoutes from "./routes/optionalIngredient";
import HeroSectionRoutes from "./routes/heroSection";
import TermsAndPolicyRoutes from "./routes/termsAndPolicy";
import BranchRoutes from "./routes/branch";
import ReservationRoutes from "./routes/reservation";
import RoleRoutes from "./routes/roleRoutes";
import StaffRoutes from "./routes/staffRoutes";
import PermissionRoutes from "./routes/permissionRoutes";
import OrganizationContextRoutes from "./routes/organizationContext";
import AuditLogsRoutes from "./routes/auditLogs";
import VoucherRoutes from "./routes/voucher";
import WebSocketService from "./services/websocketService";
import RoleService from "./services/roleService";
import { OrgMenuBackfillService } from "./services/orgMenuBackfillService";
import RequestContextService from "./services/requestContext";
import FiscalQueueWorker from "./services/fiscalQueueWorker";

const getIssuerCandidates = (): string[] => {
  const raw = process.env.CLERK_ISSUER_URL;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

// Load environment variables
// First comment by Lima jan
dotenv.config();

class AppSingleton {
  private static instance: AppSingleton;
  private app: Application;
  private server: HTTPServer | null = null;
  private port: number;

  private constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || "3001", 10);
    this.server = createServer(this.app);
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
    // Initialize WebSocket after creating HTTP server
    const wsService = WebSocketService.getInstance();
    wsService.initialize(this.server);
  }

  public static getInstance(): AppSingleton {
    if (!AppSingleton.instance) {
      AppSingleton.instance = new AppSingleton();
    }
    return AppSingleton.instance;
  }

  // Helper function to check if request is from an admin
  // This is used in rate limiting skip functions
  private async isAdminRequest(req: Request): Promise<boolean> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return false;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const issuers = getIssuerCandidates();
      if (issuers.length === 0) {
        return false;
      }

      // Verify token (try all configured issuers)
      let payload: any | null = null;
      for (const issuer of issuers) {
        try {
          payload = await verifyToken(token, { issuer });
          break;
        } catch {
          // try next issuer
        }
      }
      
      if (!payload?.sub) {
        return false;
      }

      // Check if user is admin in database
      const db = DatabaseSingleton.getInstance();
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: payload.sub },
        select: { userType: true, isActive: true },
      });

      // Check if user has admin-level access (SUPER_ADMIN or BRANCH_ADMIN)
      const adminTypes = ["SUPER_ADMIN", "BRANCH_ADMIN"];
      return user?.isActive === true && adminTypes.includes(user?.userType || "");
    } catch (error) {
      // If token verification fails, not an admin
      return false;
    }
  }

  private initializeMiddlewares(): void {
    // Trust proxy for rate limiting (needed for X-Forwarded-For headers)
    this.app.set("trust proxy", 1);
    // Disable ETag so API responses are never served as 304 (cached) by Express
    this.app.set("etag", false);

    const frontendUrl = process.env.FRONTEND_URL;
    const backendUrl = process.env.BACKEND_URL;

    const normalizeOrigin = (value: string) => value.replace(/\/$/, "");
    const allowedFrontendOrigins = (frontendUrl || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeOrigin);

    const allowedConnectOrigins = Array.from(
      new Set(
        [...allowedFrontendOrigins, backendUrl ? normalizeOrigin(backendUrl) : ""].filter(Boolean)
      )
    );

    // Security middleware with proper CORS for images
    // Allow Clerk CDN for authentication
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            imgSrc: [
              "'self'",
              "data:",
              "blob:", // Allow blob URLs for image previews before upload
              "http://localhost:3001",
              "https://maps.googleapis.com", // Google Maps API images
              "https://maps.gstatic.com", // Google Maps static images/tiles
              "https:", // Allow all HTTPS images (for general use)
            ],
            scriptSrc: [
              "'self'",
              "https://*.clerk.accounts.dev",
              "https://*.clerk.com",
              "https://clerk.nextfoody.com", // Custom Clerk domain
              "https://maps.googleapis.com", // Google Maps API
              "https://maps.gstatic.com", // Google Maps static resources
              "https://js.stripe.com", // Stripe.js
              "https://www.paypal.com", // PayPal SDK
              "https://www.paypalobjects.com", // PayPal SDK resources
              "'sha256-Z0LIZi5HO0acTx48j8FB7LJoiYpAomoSIZyouVBQLkg='",
              "'sha256-TMZ/P0RFvAmRDe3yi0FY4Gs1ZyF02VweLCr/a6PS2io='",
              "blob:", // Allow blob URLs for Clerk workers
            ],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: [
              "'self'",
              "https://*.clerk.accounts.dev",
              "https://*.clerk.com",
              "https://clerk.nextfoody.com", // Custom Clerk domain
              "https://maps.googleapis.com", // Google Maps API requests
              "https://maps.gstatic.com", // Google Maps static resources
              "https://api.stripe.com", // Stripe API
              "https://hooks.stripe.com", // Stripe webhooks
              "https://api.paypal.com", // PayPal API
              "https://api-m.paypal.com", // PayPal mobile API
              "https://www.paypal.com", // PayPal SDK connections
              "wss:",
              "ws:",
              "wss://*.clerk.accounts.dev",
              "wss://clerk.nextfoody.com", // Custom Clerk domain WebSocket
              "ws://localhost:*",
              ...allowedConnectOrigins,
            ],
            frameSrc: [
              "'self'",
              "https://*.clerk.accounts.dev",
              "https://*.clerk.com",
              "https://clerk.nextfoody.com", // Custom Clerk domain
              "https://js.stripe.com", // Stripe.js iframes
              "https://hooks.stripe.com", // Stripe webhook iframes
              "https://checkout.stripe.com", // Stripe checkout iframes
              "https://www.paypal.com", // PayPal popup/modal iframes
              "https://www.sandbox.paypal.com", // PayPal sandbox iframes (for testing)
            ],
            workerSrc: [
              "'self'",
              "blob:", // Allow blob URLs for Clerk Web Workers
            ],
          },
        },
        crossOriginResourcePolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
      })
    );

    // CORS configuration
    // Allow requests from web frontend, Electron desktop app, and mobile apps
    void backendUrl;
    
    // Configure CORS to allow:
    // 1. Web frontend (if FRONTEND_URL is set)
    // 2. Electron desktop app (no origin or file:// origin)
    // 3. Localhost for development
    // 4. Mobile apps (no origin header)
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (Electron, mobile apps, Postman, etc.)
          if (!origin) {
            return callback(null, true);
          }

          const normalizedOrigin = normalizeOrigin(origin);

          // Allow file:// protocol (Electron)
          if (origin.startsWith("file://")) {
            return callback(null, true);
          }

          // Allow configured frontend URL
          if (allowedFrontendOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
          }

          // Allow localhost for development
          if (
            origin.startsWith("http://localhost:") ||
            origin.startsWith("http://127.0.0.1:")
          ) {
            return callback(null, true);
          }

          // In development, be more permissive
          if (process.env.NODE_ENV !== "production") {
            return callback(null, true);
          }

          // In production, only allow configured origins
          callback(null, false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "x-organization-id",
        ],
      })
    );

    // Serve uploaded images statically with CORS headers
    this.app.use("/uploads", (req, res, next) => {
      const requestOrigin = req.headers.origin;

      const allowOrigin = (() => {
        if (!requestOrigin) return process.env.FRONTEND_URL || "http://localhost:5173";
        const normalized = normalizeOrigin(requestOrigin);

        if (requestOrigin.startsWith("file://")) return requestOrigin;

        if (
          requestOrigin.startsWith("http://localhost:") ||
          requestOrigin.startsWith("http://127.0.0.1:")
        ) {
          return requestOrigin;
        }

        if (allowedFrontendOrigins.includes(normalized)) return requestOrigin;

        if (process.env.NODE_ENV !== "production") return requestOrigin;

        return process.env.FRONTEND_URL || "http://localhost:5173";
      })();

      // Set CORS headers for all requests
      res.setHeader(
        "Access-Control-Allow-Origin",
        allowOrigin
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With"
      );
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        return res.status(200).end();
      }

      return next();
    });

    // Serve static files with CORS headers
    this.app.use(
      "/uploads",
      express.static(path.join(__dirname, "../uploads"), {
        setHeaders: (res, path) => {
          // Ensure CORS headers are set for static files
          if (!res.getHeader("Access-Control-Allow-Origin")) {
            res.setHeader(
              "Access-Control-Allow-Origin",
              allowedFrontendOrigins[0] || process.env.FRONTEND_URL || "http://localhost:5173"
            );
          }
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Requested-With"
          );
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
        },
      })
    );

    // Clerk authentication middleware - removed from global application
    // Each route handler will apply authentication middleware as needed
    // const clerkSingleton = ClerkSingleton.getInstance();
    // this.app.use("/api", clerkSingleton.getWithAuth() as any);

    // More lenient rate limiter specifically for notification routes (for infinite scroll)
    // This is applied BEFORE the general limiter so it takes precedence
    const notificationLimiter = rateLimit({
      windowMs: 60000, // 1 minute window
      max: 50, // 50 requests per minute (allows for rapid scrolling through many pages)
      message: {
        error: "Too many notification requests, please slow down.",
        retryAfter: 60,
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: async (req) => {
        // Skip rate limiting for admin users
        return await this.isAdminRequest(req);
      },
    });
    // this.app.use("/api/notifications", notificationLimiter);

    // Lenient rate limiter for public/user routes (categories, meals, etc.)
    // These routes are frequently accessed and should have higher limits
    const userRoutesLimiter = rateLimit({
      windowMs: 60000, // 1 minute window
      max: 200, // 200 requests per minute (very generous for normal usage)
      message: {
        error: "Too many requests, please slow down.",
        retryAfter: 60,
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: async (req) => {
        // Skip rate limiting for admin users
        return await this.isAdminRequest(req);
      },
    });
    // this.app.use("/api/user", userRoutesLimiter);

    // Rate limiter for admin routes (moderate limit)
    // Note: Admin users bypass this limiter completely
    const adminRoutesLimiter = rateLimit({
      windowMs: 60000, // 1 minute window
      max: 100, // 100 requests per minute
      message: {
        error: "Too many admin requests, please slow down.",
        retryAfter: 60,
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: async (req) => {
        // Skip rate limiting for admin users
        return await this.isAdminRequest(req);
      },
    });
    // this.app.use("/api/admin", adminRoutesLimiter);

    // Rate limiting - general limiter for most routes
    // Increased limit and applied AFTER route-specific limiters
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "1200", 10), // Increased to 1200 (4x the previous 300)
      message: {
        error: "Too many requests from this IP, please try again later.",
        retryAfter: Math.ceil(
          parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10) / 1000
        ),
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: async (req) => {
        // Skip rate limiting for admin users
        if (await this.isAdminRequest(req)) {
          return true;
        }
        // Skip rate limiting for routes that have their own limiters
        return (
          req.path.startsWith("/api/notifications") ||
          req.path.startsWith("/api/user") ||
          req.path.startsWith("/api/admin")
        );
      },
    });
    // this.app.use(limiter);

    // Logging
    if (process.env.NODE_ENV === "development") {
      this.app.use(morgan("dev"));
    } else {
      this.app.use(morgan("combined"));
    }

    // Body parsing
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request context middleware (must be after body parsing, before routes)
    this.app.use(RequestContextService.middleware());

    // Special handling for Stripe webhooks (raw body required)
    this.app.use(
      "/api/payment/webhook",
      express.raw({ type: "application/json" })
    );

    // Health check endpoint
    this.app.get("/health", async (req: Request, res: Response) => {
      const db = DatabaseSingleton.getInstance();
      const isHealthy = await db.healthCheck();

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: isHealthy ? "connected" : "disconnected",
      });
    });
  }

  private initializeRoutes(): void {
    // Initialize route singletons
    const adminRoutes = AdminRoutes.getInstance();
    const userRoutes = UserRoutes.getInstance();
    const webhookRoutes = WebhookRoutes.getInstance();
    const paymentRoutes = PaymentRoutes;
    const orderRoutes = OrderRoutes;
    const dashboardRoutes = DashboardRoutes;
    const categoryInsightsRoutes = CategoryInsightsRoutes;
    const categoryRoutes = CategoryRoutes;
    const uploadRoutes = UploadRoutes;
    const addonRoutes = AddonRoutes;
    const mealRoutes = MealRoutes;
    const refundRoutes = RefundRoutes;
    const notificationRoutes = NotificationRoutes;
    const pushNotificationRoutes = PushNotificationRoutes;
    const adminPushNotificationRoutes = AdminPushNotificationRoutes;
    const subscriptionRoutes = SubscriptionRoutes;
    const organizationPushNotificationRoutes = OrganizationPushNotificationRoutes;
    const declarationRoutes = DeclarationRoutes;
    const heroSectionRoutes = HeroSectionRoutes;
    const termsAndPolicyRoutes = TermsAndPolicyRoutes;
    const reservationRoutes = ReservationRoutes;
    const branchRoutes = BranchRoutes;

    // API routes
    this.app.get("/api", (req: Request, res: Response) => {
      res.json({
        message: "Restaurant API Server",
        version: "1.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
        endpoints: {
          admin: "/api/admin/*",
          user: "/api/user/*",
          webhook: "/api/webhook/*",
          payment: "/api/payment/*",
          order: "/api/order/*",
          dashboard: "/api/dashboard/*",
          categoryInsights: "/api/category-insights/*",
          categories: "/api/categories/*",
          upload: "/api/upload/*",
          addons: "/api/addons/*",
          meals: "/api/meals/*",
          refunds: "/api/refunds/*",
          notifications: "/api/notifications/*",
          pushNotifications: "/api/push-notifications/*",
          adminPushNotifications: "/api/admin/push-notifications/*",
          declarations: "/api/declarations/*",
          heroSection: "/api/hero-section/*",
          termsAndPolicies: "/api/terms-and-policies/*",
          reservations: "/api/reservations/*",
          health: "/health",
        },
      });
    });

    // Branch routes (public and admin)
    // Must be mounted before /api/admin to ensure /api/admin/branches* uses RBAC-based BranchRoutes.
    this.app.use("/api", branchRoutes);

    this.app.use("/api", OrganizationContextRoutes);

    this.app.use("/api/audit-logs", AuditLogsRoutes);

    // Admin routes (protected by admin middleware)
    this.app.use("/api/admin", adminRoutes.getRouter());

    // User routes (some protected, some public)
    this.app.use("/api/user", userRoutes.getRouter());

    // Webhook routes (public, but secured by signature verification)
    this.app.use("/api/webhook", webhookRoutes.getRouter());

    // Payment routes (protected by authentication)
    this.app.use("/api/payment", paymentRoutes);

    // Order routes (protected by authentication)
    this.app.use("/api/order", orderRoutes);

    // Voucher management routes (protected by authentication)
    this.app.use("/api/v1/vouchers", VoucherRoutes);

    // Dashboard routes (protected by authentication)
    this.app.use("/api/dashboard", dashboardRoutes);

    // Category insights routes (protected by authentication)
    this.app.use("/api/category-insights", categoryInsightsRoutes);

    // Category management routes (protected by authentication)
    this.app.use("/api/categories", categoryRoutes);

    // Upload routes (protected by authentication)
    this.app.use("/api/upload", uploadRoutes);

    // Addon management routes (protected by authentication)
    this.app.use("/api/addons", addonRoutes);

    // Meal management routes (protected by authentication)
    this.app.use("/api/meals", mealRoutes);

    // Deal management routes (protected by authentication for mutations)
    this.app.use("/api/deals", DealRoutes);

    // Refund management routes (protected by authentication)
    this.app.use("/api/refunds", refundRoutes);

    // Notification routes (protected by authentication, admin only)
    this.app.use("/api/notifications", notificationRoutes);

    // Push notification routes (protected by authentication)
    this.app.use("/api/push-notifications", pushNotificationRoutes);

    // Admin push notification routes (protected by authentication, admin only)
    this.app.use("/api/admin/push-notifications", adminPushNotificationRoutes);

    // Subscription routes (protected by authentication)
    this.app.use("/api/subscriptions", subscriptionRoutes);

    // Organization push notification routes (protected by RBAC)
    this.app.use("/api/organizations", organizationPushNotificationRoutes);

    // Tablet notification preferences routes (protected by authentication)
    this.app.use("/api/tablet-notification-preferences", TabletNotificationPreferencesRoutes);

    // 
    // Declaration management routes (protected by authentication)
    this.app.use("/api/declarations", declarationRoutes);

    // Optional ingredient management routes (protected by authentication)
    this.app.use("/api/optional-ingredients", OptionalIngredientRoutes);

    // Hero section routes (public for active, admin for management)
    this.app.use("/api/hero-section", heroSectionRoutes);

    // Terms and policies routes (public for active, admin for management)
    this.app.use("/api/terms-and-policies", termsAndPolicyRoutes);

    // Reservation routes (protected by authentication)
    this.app.use("/api/reservations", reservationRoutes);

    // Role management routes (protected by RBAC)
    this.app.use("/api/roles", RoleRoutes);

    // Staff management routes (protected by RBAC)
    this.app.use("/api/staff", StaffRoutes);

    // Permission routes (protected by authentication)
    this.app.use("/api/permissions", PermissionRoutes);

    // Serve static files from public directory (frontend build)
    const publicPath = path.join(__dirname, "../public");
    if (existsSync(publicPath)) {
      this.app.use(
        express.static(publicPath, {
          setHeaders: (res, servedPath) => {
            const normalized = String(servedPath || "").replace(/\\/g, "/");

            // IMPORTANT:
            // - index.html must not be cached; otherwise clients can keep an old index.html
            //   that references now-deleted hashed JS chunks, causing dynamic import failures.
            // - /assets/* is Vite hashed output and can be cached long-term.
            if (normalized.endsWith("/index.html") || normalized.endsWith("index.html")) {
              res.setHeader(
                "Cache-Control",
                "no-store, no-cache, must-revalidate, proxy-revalidate"
              );
              res.setHeader("Pragma", "no-cache");
              res.setHeader("Expires", "0");
              return;
            }

            if (normalized.includes("/assets/")) {
              res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable"
              );
              return;
            }

            // Default: allow short caching for other static files.
            res.setHeader("Cache-Control", "public, max-age=3600");
          },
        })
      );
    }

    // Catch-all route for undefined API endpoints and SPA routing
    // This must be last to handle all unmatched routes
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      // If it's an API route that hasn't been handled, return 404 JSON
      if (req.path.startsWith("/api")) {
        return res.status(404).json({
          error: "Endpoint not found",
          path: req.originalUrl,
          method: req.method,
        });
      }

      // For non-API routes, serve index.html (SPA routing)
      const publicPath = path.join(__dirname, "../public");
      if (existsSync(publicPath)) {
        const indexPath = path.join(publicPath, "index.html");
        if (existsSync(indexPath)) {
          return res.sendFile(indexPath);
        }
      }

      // If public directory doesn't exist, return helpful message
      res
        .status(404)
        .send(
          "Frontend build not found. Run 'npm run deploy' in frontend directory."
        );
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use(
      (error: Error, req: Request, res: Response, next: NextFunction) => {
        console.error("Global error handler:", error);

        // Don't leak error details in production
        const isDevelopment = process.env.NODE_ENV === "development";

        res.status(500).json({
          error: isDevelopment ? error.message : "Internal server error",
          ...(isDevelopment && { stack: error.stack }),
        });
      }
    );

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error: Error) => {
      console.error("Uncaught Exception:", error);
      process.exit(1);
    });
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      const db = DatabaseSingleton.getInstance();
      await db.connect();

      // Ensure default organization exists and backfill org ownership for menu entities.
      // This is idempotent and safe to run on every startup.
      try {
        const backfill = OrgMenuBackfillService.getInstance();
        await backfill.ensureDefaultOrganizationAndBackfillMenu();
        console.log("✅ Default organization ensured + menu org backfill complete");
      } catch (backfillError) {
        console.warn("⚠️ Menu org backfill failed (continuing startup):", backfillError);
      }

      // Start background signing worker for Fiskaly resilience
      try {
        FiscalQueueWorker.getInstance().start();
        console.log("✅ Fiscal background queue worker started");
      } catch (workerError) {
        console.warn("⚠️ Fiscal background worker failed to start:", workerError);
      }

      // Initialize system roles for RBAC
      // (disabled: roles should be created explicitly per-organization)

      // Start HTTP server (with Socket.IO support)
      this.server?.listen(this.port, () => {
        console.log(`🚀 Server running on port ${this.port}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`🔌 WebSocket server initialized`);
      });
    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  public getServer(): HTTPServer | null {
    return this.server;
  }

  public getApp(): Application {
    return this.app;
  }

  public async gracefulShutdown(): Promise<void> {
    try {
      try {
        FiscalQueueWorker.getInstance().stop();
        console.log("✅ Fiscal background queue worker stopped");
      } catch (e) {
        console.warn("⚠️ Failed to stop fiscal worker cleanly:", e);
      }
      const db = DatabaseSingleton.getInstance();
      await db.disconnect();
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during graceful shutdown:", error);
      process.exit(1);
    }
  }
}

export default AppSingleton;
