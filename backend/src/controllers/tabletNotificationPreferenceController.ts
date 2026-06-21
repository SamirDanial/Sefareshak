import { Response } from "express";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest } from "../types";

export class TabletNotificationPreferenceController {
  /**
   * Get user's tablet notification preferences
   */
  public getPreferences = async (
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

      // Get the user's database ID from Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
        select: { id: true },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      const preferences = await db.getPrisma().tabletNotificationPreference.findMany({
        where: { userId: user.id },
        include: {
          organization: {
            select: { id: true, name: true },
          },
          branch: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        success: true,
        data: preferences,
      });
    } catch (error) {
      console.error("Error fetching tablet notification preferences:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch notification preferences",
      });
    }
  };

  /**
   * Set tablet notification preference
   */
  public setPreference = async (
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

      const { organizationId, branchId, enabled = true } = req.body;

      // Must specify either organizationId or branchId, but not both
      if (!organizationId && !branchId) {
        res.status(400).json({
          success: false,
          error: "Either organizationId or branchId is required",
        });
        return;
      }

      if (organizationId && branchId) {
        res.status(400).json({
          success: false,
          error: "Cannot specify both organizationId and branchId",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Get the user's database ID from Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
        select: { id: true },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Validate organization exists if specified
      if (organizationId) {
        const organization = await db.getPrisma().organization.findUnique({
          where: { id: organizationId },
        });

        if (!organization) {
          res.status(404).json({
            success: false,
            error: "Organization not found",
          });
          return;
        }
      }

      // Validate branch exists if specified
      if (branchId) {
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId },
        });

        if (!branch) {
          res.status(404).json({
            success: false,
            error: "Branch not found",
          });
          return;
        }
      }

      // Check if preference already exists
      const existingPreference = await db.getPrisma().tabletNotificationPreference.findUnique({
        where: {
          userId_organizationId_branchId: {
            userId: user.id,
            organizationId: organizationId || null,
            branchId: branchId || null,
          },
        },
      });

      let preference;

      if (existingPreference) {
        // Update existing preference
        preference = await db.getPrisma().tabletNotificationPreference.update({
          where: { id: existingPreference.id },
          data: { enabled },
          include: {
            organization: {
              select: { id: true, name: true },
            },
            branch: {
              select: { id: true, name: true },
            },
          },
        });
      } else {
        // Create new preference
        preference = await db.getPrisma().tabletNotificationPreference.create({
          data: {
            userId: user.id,
            organizationId: organizationId || null,
            branchId: branchId || null,
            enabled,
          },
          include: {
            organization: {
              select: { id: true, name: true },
            },
            branch: {
              select: { id: true, name: true },
            },
          },
        });
      }

      res.json({
        success: true,
        data: preference,
        message: existingPreference ? "Preference updated" : "Preference created",
      });
    } catch (error) {
      console.error("Error setting tablet notification preference:", error);
      res.status(500).json({
        success: false,
        error: "Failed to set notification preference",
      });
    }
  };

  /**
   * Delete tablet notification preference
   */
  public deletePreference = async (
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

      const { id } = req.params;

      const db = DatabaseSingleton.getInstance();

      // Get the user's database ID from Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
        select: { id: true },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Check if preference exists and belongs to user
      const preference = await db.getPrisma().tabletNotificationPreference.findUnique({
        where: { id },
      });

      if (!preference) {
        res.status(404).json({
          success: false,
          error: "Preference not found",
        });
        return;
      }

      if (preference.userId !== user.id) {
        res.status(403).json({
          success: false,
          error: "You can only delete your own preferences",
        });
        return;
      }

      await db.getPrisma().tabletNotificationPreference.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Preference deleted",
      });
    } catch (error) {
      console.error("Error deleting tablet notification preference:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete notification preference",
      });
    }
  };

  /**
   * Auto-create preferences based on user role (called on first login)
   */
  public autoCreatePreferences = async (
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

      // Get the user's database ID from Clerk ID
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
        select: {
          id: true,
          userType: true,
          orgRole: true,
          organizationId: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Check if user already has preferences
      const existingPreferences = await db.getPrisma().tabletNotificationPreference.findMany({
        where: { userId: user.id },
      });

      if (existingPreferences.length > 0) {
        res.json({
          success: true,
          message: "User already has preferences",
          data: existingPreferences,
        });
        return;
      }

      const createdPreferences: any[] = [];

      // If org admin or owner, create org-wide preference
      if (user.userType === "SUPER_ADMIN" || user.orgRole === "ORG_OWNER" || user.orgRole === "ORG_ADMIN") {
        if (user.organizationId) {
          const orgPreference = await db.getPrisma().tabletNotificationPreference.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              enabled: true,
            },
            include: {
              organization: {
                select: { id: true, name: true },
              },
            },
          });
          createdPreferences.push(orgPreference);
        }
      } else {
        // If employee, create preferences for assigned branches
        const assignedBranches = await db.getPrisma().userBranch.findMany({
          where: { userId: user.id },
          include: {
            branch: {
              select: { id: true, name: true },
            },
          },
        });

        for (const assignment of assignedBranches) {
          const branchPreference = await db.getPrisma().tabletNotificationPreference.create({
            data: {
              userId: user.id,
              branchId: assignment.branchId,
              enabled: true,
            },
            include: {
              branch: {
                select: { id: true, name: true },
              },
            },
          });
          createdPreferences.push(branchPreference);
        }
      }

      res.json({
        success: true,
        data: createdPreferences,
        message: createdPreferences.length > 0 ? "Preferences auto-created" : "No preferences created (user has no assigned branches)",
      });
    } catch (error) {
      console.error("Error auto-creating tablet notification preferences:", error);
      res.status(500).json({
        success: false,
        error: "Failed to auto-create notification preferences",
      });
    }
  };
}
