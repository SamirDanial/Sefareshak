import { PrismaClient, UserType } from "@prisma/client";
import DatabaseSingleton from "../config/database";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      id: string;
    }>;
    first_name?: string;
    last_name?: string;
    phone_numbers?: Array<{
      phone_number: string;
      id: string;
    }>;
    created_at: number;
    updated_at: number;
  };
}

class WebhookService {
  private static instance: WebhookService;
  private prisma: PrismaClient;

  private constructor() {
    const db = DatabaseSingleton.getInstance();
    this.prisma = db.getPrisma();
  }

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  /**
   * Handle user.created webhook event from Clerk
   */
  public async handleUserCreated(event: ClerkWebhookEvent): Promise<void> {
    try {
      const { data } = event;

      // Extract user information
      const clerkId = data.id;
      const email = data.email_addresses[0]?.email_address;
      const firstName = data.first_name || null;
      const lastName = data.last_name || null;
      const phone = data.phone_numbers?.[0]?.phone_number || null;

      if (!email) {
        throw new Error("No email address found in webhook data");
      }

      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { clerkId },
      });

      if (existingUser) {
        return;
      }

      // Create new user in database
      const newUser = await this.prisma.user.create({
        data: {
          clerkId,
          email,
          firstName,
          lastName,
          phone,
          userType: UserType.USER, // Default userType
          isActive: true,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle user.updated webhook event from Clerk
   */
  public async handleUserUpdated(event: ClerkWebhookEvent): Promise<void> {
    try {
      const { data } = event;

      const clerkId = data.id;
      const email = data.email_addresses[0]?.email_address;
      const firstName = data.first_name || null;
      const lastName = data.last_name || null;
      const phone = data.phone_numbers?.[0]?.phone_number || null;

      if (!email) {
        throw new Error("No email address found in webhook data");
      }

      // Find existing user
      const existingUser = await this.prisma.user.findUnique({
        where: { clerkId },
      });

      if (!existingUser) {
        await this.handleUserCreated(event);
        return;
      }

      // Only update fields that have actually changed in Clerk
      // Preserve existing database values for firstName/lastName if they exist
      const updateData: any = {
        email, // Always update email as it's critical
      };

      // Only update firstName/lastName if they are EMPTY in the database
      // This prevents Clerk from overriding user's custom profile data
      if (firstName && !existingUser.firstName) {
        updateData.firstName = firstName;
      }
      if (lastName && !existingUser.lastName) {
        updateData.lastName = lastName;
      }
      if (phone && phone !== existingUser.phone) {
        updateData.phone = phone;
      }

      // Only perform update if there are actual changes
      if (Object.keys(updateData).length > 1) {
        // More than just email
        const updatedUser = await this.prisma.user.update({
          where: { clerkId },
          data: updateData,
        });
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle user.deleted webhook event from Clerk
   */
  public async handleUserDeleted(event: ClerkWebhookEvent): Promise<void> {
    try {
      const { data } = event;
      const clerkId = data.id;

      // Find and deactivate user instead of deleting (soft delete)
      const existingUser = await this.prisma.user.findUnique({
        where: { clerkId },
      });

      if (!existingUser) {
        return;
      }

      // Soft delete by setting isActive to false
      await this.prisma.user.update({
        where: { clerkId },
        data: { isActive: false },
      });
    } catch (error) {
      console.error("❌ Error handling user.deleted webhook:", error);
      throw error;
    }
  }

  /**
   * Process webhook event based on event type
   */
  public async processWebhookEvent(event: ClerkWebhookEvent): Promise<void> {
    const eventType = event.type;

    switch (eventType) {
      case "user.created":
        await this.handleUserCreated(event);
        break;
      case "user.updated":
        await this.handleUserUpdated(event);
        break;
      case "user.deleted":
        await this.handleUserDeleted(event);
        break;
      default:
        break;
    }
  }
}

export default WebhookService;
