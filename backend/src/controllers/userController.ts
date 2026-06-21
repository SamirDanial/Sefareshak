import { Request, Response } from "express";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest, CreateUserRequest } from "../types";
import {
  updateUserProfileSchema,
  createUserSchema,
} from "../validation/schemas";
import { ZodError } from "zod";

class UserController {
  private static instance: UserController;

  private constructor() {}

  public static getInstance(): UserController {
    if (!UserController.instance) {
      UserController.instance = new UserController();
    }
    return UserController.instance;
  }

  // Create or update user from Clerk webhook
  public createOrUpdateUser = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // Validate using Zod schema
      try {
        const validatedData = createUserSchema.parse(req.body);
        const { clerkId, email, firstName, lastName, phone, role } =
          validatedData;

        const db = DatabaseSingleton.getInstance();

        // Check if user already exists by clerkId OR email (if email provided)
        // This prevents duplicate creation when user refreshes the page
        const whereClause: any = { clerkId };
        if (email) {
          whereClause.OR = [{ clerkId }, { email }];
        }
        const existingUser = await db.getPrisma().user.findFirst({
          where: whereClause,
        });

        if (existingUser) {
          // Update existing user - preserve existing firstName/lastName if they exist
          const updateData: any = {};

          // Update clerkId if it's different (handles case where email exists but clerkId is different)
          if (existingUser.clerkId !== clerkId) {
            updateData.clerkId = clerkId;
          }

          // Update email only if it changed
          if (email && email !== existingUser.email) {
            updateData.email = email;
          }

          // Only update userType if provided (preserve existing userType if not provided)
          if (role) {
            // Map legacy role values to new userType
            const userTypeMap: Record<string, string> = {
              'ADMIN': 'BRANCH_ADMIN',
              'USER': 'USER'
            };
            updateData.userType = userTypeMap[role] || role;
          }

          // Only update firstName/lastName if they are EMPTY in the database
          // This prevents overriding user's custom profile data
          if (firstName && !existingUser.firstName) {
            updateData.firstName = firstName;
          }
          if (lastName && !existingUser.lastName) {
            updateData.lastName = lastName;
          }
          if (phone && phone !== existingUser.phone) {
            updateData.phone = phone;
          }

          // If there are no meaningful changes, return existing user to avoid noisy updates
          if (Object.keys(updateData).length === 0) {
            res.json({
              success: true,
              data: existingUser,
              message: "User already up to date",
            });
            return;
          }

          const updatedUser = await db.getPrisma().user.update({
            where: { id: existingUser.id },
            data: updateData,
          });

          res.json({
            success: true,
            data: updatedUser,
            message: "User updated successfully",
          });
        } else {
          // Create new user
          // Map legacy role values to new userType
          const userTypeMap: Record<string, string> = {
            'ADMIN': 'BRANCH_ADMIN',
            'USER': 'USER'
          };
          const userType = role ? (userTypeMap[role] || role) : "USER";
          
          const newUser = await db.getPrisma().user.create({
            data: {
              clerkId,
              email,
              firstName,
              lastName,
              phone,
              userType: userType as any, // Default to USER if no role provided
            },
          });

          res.status(201).json({
            success: true,
            data: newUser,
            message: "User created successfully",
          });
        }
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json({
            success: false,
            error: "Validation failed",
            details: error.issues.map((err) => err.message),
          });
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error("Create/Update user error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create/update user",
      });
    }
  };

  // Get user profile
  public getUserProfile = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Get user with addresses
      const userWithAddresses = await db.getPrisma().user.findUnique({
        where: { id: req.user.id },
        include: {
          addresses: true,
        },
      });

      if (!userWithAddresses) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      res.json({
        success: true,
        data: userWithAddresses,
      });
    } catch (error) {
      console.error("Get user profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get user profile",
      });
    }
  };

  // Update user profile
  public updateUserProfile = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      const { firstName, lastName, phone, description, addresses } = req.body;

      // Validate using Zod schema
      try {
        const validatedData = updateUserProfileSchema.parse({
          firstName,
          lastName,
          phone,
          description,
          addresses,
        });

        const db = DatabaseSingleton.getInstance();

        // Update user profile
        const updatedUser = await db.getPrisma().user.update({
          where: { id: req.user.id },
          data: {
            firstName: validatedData.firstName,
            lastName: validatedData.lastName,
            phone: validatedData.phone,
            description: validatedData.description,
            updatedAt: new Date(),
          },
        });

        // Handle addresses - delete existing and create new ones
        if (
          validatedData.addresses &&
          validatedData.addresses.length > 0 &&
          req.user
        ) {
          // Delete existing addresses
          await db.getPrisma().userAddress.deleteMany({
            where: { userId: req.user.id },
          });

          // Create new addresses
          await db.getPrisma().userAddress.createMany({
            data: validatedData.addresses.map((address) => ({
              userId: req.user!.id,
              label: address.label,
              street: address.street,
              city: address.city,
              state: address.state,
              zipCode: address.zipCode,
              isDefault: address.isDefault,
            })),
          });
        }

        res.json({
          success: true,
          data: updatedUser,
          message: "Profile updated successfully",
        });
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json({
            success: false,
            error: "Validation failed",
            details: error.issues.map((err) => err.message),
          });
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error("Update user profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update user profile",
      });
    }
  };

  // Delete user (soft delete)
  public deleteUser = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      await db.getPrisma().user.update({
        where: { id: req.user.id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        message: "User deactivated successfully",
      });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete user",
      });
    }
  };
}

export default UserController;
