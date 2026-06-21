import DatabaseSingleton from "../config/database";
import { CreateUserRequest, UpdateUserRequest, UserType } from "../types";

class UserService {
  private static instance: UserService;
  private db: DatabaseSingleton;

  private constructor() {
    this.db = DatabaseSingleton.getInstance();
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  // Create a new user
  public async createUser(userData: CreateUserRequest) {
    try {
      const user = await this.db.getPrisma().user.create({
        data: {
          clerkId: userData.clerkId,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: userData.phone,
          userType: userData.userType || "USER",
        },
      });

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error("Error creating user:", error);
      return {
        success: false,
        error: error.message || "Failed to create user",
      };
    }
  }

  // Get user by Clerk ID
  public async getUserByClerkId(clerkId: string) {
    try {
      const user = await this.db.getPrisma().user.findUnique({
        where: { clerkId },
        include: {
          orders: {
            orderBy: { createdAt: "desc" },
            take: 10, // Last 10 orders
          },
        },
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error("Error fetching user:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch user",
      };
    }
  }

  // Update user
  public async updateUser(userId: string, userData: UpdateUserRequest) {
    try {
      const user = await this.db.getPrisma().user.update({
        where: { id: userId },
        data: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: userData.phone,
          userType: userData.userType,
          isActive: userData.isActive,
        },
      });

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error("Error updating user:", error);
      return {
        success: false,
        error: error.message || "Failed to update user",
      };
    }
  }

  // Update user profile (for profile page)
  public async updateUserProfile(
    clerkId: string,
    profileData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      description?: string;
    }
  ) {
    try {
      const user = await this.db.getPrisma().user.update({
        where: { clerkId },
        data: {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          phone: profileData.phone,
          description: profileData.description,
        },
      });

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error("Error updating user profile:", error);
      return {
        success: false,
        error: error.message || "Failed to update user profile",
      };
    }
  }

  // Get all users (admin only)
  public async getAllUsers(page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        this.db.getPrisma().user.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            clerkId: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            userType: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { orders: true },
            },
          },
        }),
        this.db.getPrisma().user.count(),
      ]);

      return {
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      console.error("Error fetching users:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch users",
      };
    }
  }

  // Promote user to admin
  public async promoteToAdmin(userId: string) {
    try {
      const user = await this.db.getPrisma().user.update({
        where: { id: userId },
        data: { userType: "BRANCH_ADMIN" },
      });

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error("Error promoting user to admin:", error);
      return {
        success: false,
        error: error.message || "Failed to promote user",
      };
    }
  }

  // Demote admin to user
  public async demoteToUser(userId: string) {
    try {
      const user = await this.db.getPrisma().user.update({
        where: { id: userId },
        data: { userType: "USER" },
      });

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error("Error demoting admin to user:", error);
      return {
        success: false,
        error: error.message || "Failed to demote user",
      };
    }
  }

  // Deactivate user
  public async deactivateUser(userId: string) {
    try {
      const user = await this.db.getPrisma().user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error("Error deactivating user:", error);
      return {
        success: false,
        error: error.message || "Failed to deactivate user",
      };
    }
  }

  // Check if user is admin
  public async isAdmin(clerkId: string): Promise<boolean> {
    try {
      const user = await this.db.getPrisma().user.findUnique({
        where: { clerkId },
        select: { userType: true },
      });

      // Check if user has admin-level access
      const adminTypes = ["SUPER_ADMIN", "BRANCH_ADMIN"];
      return adminTypes.includes(user?.userType || "");
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  }

  // Get user statistics (admin only)
  public async getUserStats() {
    try {
      const [totalUsers, activeUsers, adminUsers, recentUsers] =
        await Promise.all([
          this.db.getPrisma().user.count(),
          this.db.getPrisma().user.count({ where: { isActive: true } }),
          this.db.getPrisma().user.count({ where: { userType: { in: ["SUPER_ADMIN", "BRANCH_ADMIN"] } } }),
          this.db.getPrisma().user.count({
            where: {
              createdAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
              },
            },
          }),
        ]);

      return {
        success: true,
        data: {
          totalUsers,
          activeUsers,
          adminUsers,
          regularUsers: totalUsers - adminUsers,
          recentUsers,
        },
      };
    } catch (error: any) {
      console.error("Error fetching user stats:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch user statistics",
      };
    }
  }
}

export default UserService;
