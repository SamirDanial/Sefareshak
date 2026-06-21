import { Request, Response } from "express";
import { Webhook } from "svix";
import WebhookService from "../services/webhookService";

class WebhookController {
  private webhookService: WebhookService;

  constructor() {
    this.webhookService = WebhookService.getInstance();
  }

  /**
   * Handle Clerk webhook events
   */
  public handleClerkWebhook = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // Get the webhook secret from environment variables
      const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error("CLERK_WEBHOOK_SECRET is not set");
        res.status(500).json({ error: "Webhook secret not configured" });
        return;
      }

      // Get headers
      const svixId = req.headers["svix-id"] as string;
      const svixTimestamp = req.headers["svix-timestamp"] as string;
      const svixSignature = req.headers["svix-signature"] as string;

      // Verify headers are present
      if (!svixId || !svixTimestamp || !svixSignature) {
        console.error("Missing required svix headers");
        res.status(400).json({ error: "Missing required headers" });
        return;
      }

      // Get the raw body
      const body = JSON.stringify(req.body);

      // Create a new Svix instance with your webhook secret
      const wh = new Webhook(webhookSecret);

      let evt: any;

      try {
        // Verify the webhook
        evt = wh.verify(body, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        });
      } catch (err) {
        console.error("Webhook verification failed:", err);
        res.status(400).json({ error: "Webhook verification failed" });
        return;
      }

      await this.webhookService.processWebhookEvent(evt);

      res.status(200).json({ message: "Webhook processed successfully" });
    } catch (error) {
      console.error("❌ Webhook processing error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Health check for webhook endpoint
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: "healthy",
      endpoint: "webhook",
      timestamp: new Date().toISOString(),
    });
  };
}

export default WebhookController;
