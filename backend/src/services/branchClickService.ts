import { BranchClick, User } from "@prisma/client";
import DatabaseSingleton from "../config/database";

export interface CreateBranchClickData {
  branchId: string;
  userId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface BranchClickStats {
  totalClicks: number;
  uniqueUsers: number;
  anonymousClicks: number;
  recentClicks: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  clicksByHour: { hour: number; clicks: number }[];
  clicksByDay: { date: string; clicks: number }[];
}

export class BranchClickService {
  private static instance: BranchClickService;

  static getInstance(): BranchClickService {
    if (!BranchClickService.instance) {
      BranchClickService.instance = new BranchClickService();
    }
    return BranchClickService.instance;
  }

  private db = DatabaseSingleton.getInstance();

  /**
   * Record a branch click
   */
  public async recordBranchClick(data: CreateBranchClickData): Promise<BranchClick> {
    const { branchId, userId, userAgent, ipAddress } = data;

    // Verify branch exists
    const branch = await this.db.getPrisma().branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true }
    });

    if (!branch) {
      throw new Error('Branch not found');
    }

    if (!branch.isActive) {
      throw new Error('Branch is not active');
    }

    // If userId is provided, verify user exists
    if (userId && userId.trim() !== '') {
      const user = await this.db.getPrisma().user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.isActive) {
        throw new Error('User is not active');
      }
    }

    // Create the click record
    const click = await this.db.getPrisma().branchClick.create({
      data: {
        branchId,
        userId: (userId && userId.trim() !== '') ? userId : null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        clickTime: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return click;
  }

  /**
   * Get click statistics for a branch
   */
  public async getBranchClickStats(branchId: string): Promise<BranchClickStats> {
    // Verify branch exists
    const branch = await this.db.getPrisma().branch.findUnique({
      where: { id: branchId },
      select: { id: true }
    });

    if (!branch) {
      throw new Error('Branch not found');
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all clicks for the branch
    const clicks = await this.db.getPrisma().branchClick.findMany({
      where: { branchId },
      select: {
        id: true,
        userId: true,
        clickTime: true
      },
      orderBy: { clickTime: 'desc' }
    });

    // Calculate basic stats
    const totalClicks = clicks.length;
    const uniqueUsers = new Set(clicks.filter(c => c.userId).map(c => c.userId)).size;
    const anonymousClicks = clicks.filter(c => !c.userId).length;

    // Calculate time-based stats
    const todayClicks = clicks.filter(c => c.clickTime >= today).length;
    const weekClicks = clicks.filter(c => c.clickTime >= weekStart).length;
    const monthClicks = clicks.filter(c => c.clickTime >= monthStart).length;

    // Calculate clicks by hour (last 24 hours)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentClicks = clicks.filter(c => c.clickTime >= twentyFourHoursAgo);
    
    const clicksByHour = Array.from({ length: 24 }, (_, i) => {
      const hour = (now.getHours() - i + 24) % 24;
      const hourStart = new Date(now);
      hourStart.setHours(hour, 0, 0, 0);
      const hourEnd = new Date(now);
      hourEnd.setHours(hour, 59, 59, 999);
      
      const hourClicks = recentClicks.filter(c => 
        c.clickTime >= hourStart && c.clickTime <= hourEnd
      ).length;

      return { hour, clicks: hourClicks };
    }).reverse();

    // Calculate clicks by day (last 30 days)
    const clicksByDay = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      
      const dayClicks = clicks.filter(c => 
        c.clickTime >= date && c.clickTime < nextDay
      ).length;

      return { 
        date: date.toISOString().split('T')[0], 
        clicks: dayClicks 
      };
    }).reverse();

    return {
      totalClicks,
      uniqueUsers,
      anonymousClicks,
      recentClicks: {
        today: todayClicks,
        thisWeek: weekClicks,
        thisMonth: monthClicks
      },
      clicksByHour,
      clicksByDay
    };
  }

  /**
   * Get recent clicks for a branch with pagination
   */
  public async getBranchClicks(
    branchId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<{ clicks: BranchClick[]; total: number; page: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    // Verify branch exists
    const branch = await this.db.getPrisma().branch.findUnique({
      where: { id: branchId },
      select: { id: true }
    });

    if (!branch) {
      throw new Error('Branch not found');
    }

    const [clicks, total] = await Promise.all([
      this.db.getPrisma().branchClick.findMany({
        where: { branchId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { clickTime: 'desc' },
        skip,
        take: limit
      }),
      this.db.getPrisma().branchClick.count({
        where: { branchId }
      })
    ]);

    return {
      clicks,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get click statistics for all branches in an organization
   */
  public async getOrganizationClickStats(organizationId: string): Promise<{
    totalClicks: number;
    branchStats: Array<{
      branchId: string;
      branchName: string;
      totalClicks: number;
      uniqueUsers: number;
    }>;
  }> {
    // Get all branches for the organization
    const branches = await this.db.getPrisma().branch.findMany({
      where: { organizationId },
      select: { id: true, name: true }
    });

    if (!branches.length) {
      return {
        totalClicks: 0,
        branchStats: []
      };
    }

    const branchIds = branches.map(b => b.id);

    // Get all clicks for these branches
    const clicks = await this.db.getPrisma().branchClick.findMany({
      where: { branchId: { in: branchIds } },
      select: {
        branchId: true,
        userId: true,
        id: true
      }
    });

    // Calculate stats per branch
    const branchStats = branches.map(branch => {
      const branchClicks = clicks.filter(c => c.branchId === branch.id);
      const uniqueUsers = new Set(
        branchClicks.filter(c => c.userId).map(c => c.userId)
      ).size;

      return {
        branchId: branch.id,
        branchName: branch.name,
        totalClicks: branchClicks.length,
        uniqueUsers
      };
    });

    return {
      totalClicks: clicks.length,
      branchStats: branchStats.sort((a, b) => b.totalClicks - a.totalClicks)
    };
  }
}

export default BranchClickService.getInstance();
