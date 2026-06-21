import { Response } from "express";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest } from "../types";

export class SubscriptionController {
  /**
   * Subscribe to a branch
   */
  public subscribeToBranch = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const { branchId } = req.params;

      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Find the user by Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Check if branch exists and is active
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
        include: { organization: true },
      });

      if (!branch) {
        res.status(404).json({
          success: false,
          error: "Branch not found",
        });
        return;
      }

      if (!branch.isActive) {
        res.status(400).json({
          success: false,
          error: "Branch is not active",
        });
        return;
      }

      // Check if already subscribed
      const existingSubscription =
        await db.getPrisma().branchSubscription.findUnique({
          where: {
            userId_branchId: {
              userId: user.id,
              branchId,
            },
          },
        });

      if (existingSubscription) {
        res.json({
          success: true,
          message: "Already subscribed to this branch",
          data: existingSubscription,
        });
        return;
      }

      // Create subscription
      const subscription = await db.getPrisma().branchSubscription.create({
        data: {
          userId: user.id,
          branchId,
        },
        include: {
          branch: {
            include: {
              organization: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: "Successfully subscribed to branch",
        data: subscription,
      });
    } catch (error) {
      console.error("Error subscribing to branch:", error);
      res.status(500).json({
        success: false,
        error: "Failed to subscribe to branch",
      });
    }
  };

  /**
   * Unsubscribe from a branch
   */
  public unsubscribeFromBranch = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const { branchId } = req.params;

      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Find the user by Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Check if subscription exists
      const subscription =
        await db.getPrisma().branchSubscription.findUnique({
          where: {
            userId_branchId: {
              userId: user.id,
              branchId,
            },
          },
        });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: "Subscription not found",
        });
        return;
      }

      // Delete subscription
      await db.getPrisma().branchSubscription.delete({
        where: {
          userId_branchId: {
            userId: user.id,
            branchId,
          },
        },
      });

      res.json({
        success: true,
        message: "Successfully unsubscribed from branch",
      });
    } catch (error) {
      console.error("Error unsubscribing from branch:", error);
      res.status(500).json({
        success: false,
        error: "Failed to unsubscribe from branch",
      });
    }
  };

  /**
   * Get subscription status for a specific branch
   */
  public getSubscriptionStatus = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const { branchId } = req.params;

      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Find the user by Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
      });

      if (!user) {
        res.json({
          success: true,
          data: {
            isSubscribed: false,
            subscription: null,
          },
        });
        return;
      }

      const subscription =
        await db.getPrisma().branchSubscription.findUnique({
          where: {
            userId_branchId: {
              userId: user.id,
              branchId,
            },
          },
        });

      res.json({
        success: true,
        data: {
          isSubscribed: !!subscription,
          subscription,
        },
      });
    } catch (error) {
      console.error("Error getting subscription status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get subscription status",
      });
    }
  };

  /**
   * Get all branches the user is subscribed to
   */
  public getUserSubscriptions = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const { page = 1, limit = 20 } = req.query;

      // Find the user by Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
      });

      if (!user) {
        res.json({
          success: true,
          data: {
            subscriptions: [],
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: 0,
              pages: 0,
            },
          },
        });
        return;
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [subscriptions, total] = await Promise.all([
        db.getPrisma().branchSubscription.findMany({
          where: {
            userId: user.id,
          },
          skip,
          take: Number(limit),
          include: {
            branch: {
              include: {
                organization: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        db.getPrisma().branchSubscription.count({
          where: {
            userId: user.id,
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          subscriptions,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error getting user subscriptions:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get user subscriptions",
      });
    }
  };
}
