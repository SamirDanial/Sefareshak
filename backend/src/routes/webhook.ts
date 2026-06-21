import { Router } from "express";
import WebhookController from "../controllers/webhookController";

class WebhookRoutes {
  private static instance: WebhookRoutes;
  private router: Router;
  private webhookController: WebhookController;

  private constructor() {
    this.router = Router();
    this.webhookController = new WebhookController();
    this.initializeRoutes();
  }

  public static getInstance(): WebhookRoutes {
    if (!WebhookRoutes.instance) {
      WebhookRoutes.instance = new WebhookRoutes();
    }
    return WebhookRoutes.instance;
  }

  private initializeRoutes(): void {
    // Clerk webhook endpoint
    this.router.post("/clerk", this.webhookController.handleClerkWebhook);

    // Webhook health check
    this.router.get("/health", this.webhookController.healthCheck);
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default WebhookRoutes;
