import { Branch } from "@prisma/client";
import DatabaseSingleton from "../config/database";
import { calculateDistance } from "../utils/distanceCalculator";
import { getEffectiveDeliverySettings } from "../utils/branchConfigHelper";

export class BranchService {
  private static instance: BranchService;

  static getInstance(): BranchService {
    if (!BranchService.instance) {
      BranchService.instance = new BranchService();
    }
    return BranchService.instance;
  }

  private db = DatabaseSingleton.getInstance();

  public async getMainBranch(): Promise<Branch | null> {
    // Since isMainBranch was removed, return the first active branch as fallback
    const now = new Date();

    const validOrganizationWhere = {
      isActive: true,
      isValidated: true,
      OR: [
        {
          validations: {
            some: {
              isActive: true,
              unvalidatedAt: null,
              expiresAt: { gt: now },
            } as any,
          } as any,
        },
      ],
    };

    return this.db.getPrisma().branch.findFirst({
      where: {
        isActive: true,
        OR: [
          { organizationId: null }, 
          { 
            organization: { 
              ...(validOrganizationWhere as any),
            } as any 
          }
        ],
      } as any,
      orderBy: { createdAt: 'asc' },
    });
  }

  public async getActiveBranches(): Promise<Branch[]> {
    const now = new Date();

    const validOrganizationWhere = {
      isActive: true,
      isValidated: true,
      OR: [
        {
          validations: {
            some: {
              isActive: true,
              unvalidatedAt: null,
              expiresAt: { gt: now },
            } as any,
          } as any,
        },
      ],
    };

    return this.db.getPrisma().branch.findMany({
      where: {
        isActive: true,
        OR: [
          { organizationId: null }, 
          { 
            organization: { 
              ...(validOrganizationWhere as any),
            } as any 
          }
        ],
      } as any,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find nearest active branch within delivery radius.
   * Returns the nearest branch and distance in km, or null if none available.
   */
  public async findNearestBranch(
    userLat: number,
    userLon: number
  ): Promise<{ branch: Branch; distance: number } | null> {
    const branches = await this.getActiveBranches();
    if (!branches.length) return null;

    const orgIds = Array.from(
      new Set(
        branches
          .map((b) => (b as any).organizationId as string | null | undefined)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );

    const settingsRows = await this.db.getPrisma().settings.findMany({
      where: {
        organizationId: { in: orgIds },
      } as any,
      select: {
        organizationId: true,
        deliveryEnabled: true,
        deliveryRadius: true,
      } as any,
    });

    const globalSettings = await this.db.getPrisma().settings.findFirst({
      where: { organizationId: null } as any,
      select: {
        organizationId: true,
        deliveryEnabled: true,
        deliveryRadius: true,
      } as any,
    });

    const settingsByOrgId = new Map<string, any>();
    for (const row of settingsRows as any[]) {
      if (row?.organizationId) settingsByOrgId.set(String(row.organizationId), row);
    }

    const candidates: { branch: Branch; distance: number }[] = [];

    for (const branch of branches) {
      if (branch.latitude === null || branch.longitude === null) continue;

      const orgId = (branch as any).organizationId as string | null | undefined;
      const baseSettings = (orgId && settingsByOrgId.get(String(orgId))) || globalSettings;
      if (!baseSettings) continue;

      const effective = getEffectiveDeliverySettings(branch, baseSettings);
      if (!effective.deliveryEnabled) continue;

      const branchLat = Number(branch.latitude);
      const branchLon = Number(branch.longitude);
      if (isNaN(branchLat) || isNaN(branchLon)) continue;

      const distance = calculateDistance(userLat, userLon, branchLat, branchLon);

      const radiusKm = effective.deliveryRadius;
      if (radiusKm !== null && distance <= radiusKm) {
        candidates.push({ branch, distance });
      }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }

  /**
   * Delivery availability check result.
   */
  public async checkDeliveryAvailability(
    userLat: number,
    userLon: number
  ): Promise<
    | { available: true; branch: Branch; distance: number }
    | { available: false; message: string }
  > {
    const nearest = await this.findNearestBranch(userLat, userLon);

    if (!nearest) {
      return {
        available: false,
        message: "We don't have delivery at that area at the moment",
      };
    }

    return {
      available: true,
      branch: nearest.branch,
      distance: nearest.distance,
    };
  }

  public async likeBranch(userId: string, branchId: string): Promise<void> {
    await this.db.getPrisma().branchLike.upsert({
      where: {
        userId_branchId: {
          userId,
          branchId,
        },
      },
      create: {
        userId,
        branchId,
      },
      update: {},
    });
  }

  public async unlikeBranch(userId: string, branchId: string): Promise<void> {
    await this.db.getPrisma().branchLike.deleteMany({
      where: {
        userId,
        branchId,
      },
    });
  }

  public async getLikedBranches(userId: string): Promise<Branch[]> {
    const likes = await this.db.getPrisma().branchLike.findMany({
      where: {
        userId,
      },
      include: {
        branch: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const branches = likes.map((like: any) => like.branch);
    return branches;
  }

  public async getOrganizationBranchLikes(
    orgId: string,
    page: number,
    limit: number,
    search?: string,
    branchId?: string
  ): Promise<{ users: any[]; pagination: any }> {
    const skip = (page - 1) * limit;

    const baseWhere: any = {
      branchLikes: {
        some: {
          branch: {
            organizationId: orgId,
          },
        },
      },
    };

    if (branchId) {
      baseWhere.branchLikes.some.branchId = branchId;
    }

    if (search && search.trim()) {
      baseWhere.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [totalCount, users] = await Promise.all([
      this.db.getPrisma().user.count({ where: baseWhere }),
      this.db.getPrisma().user.findMany({
        where: baseWhere,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
          branchLikes: {
            where: {
              branch: {
                organizationId: orgId,
              },
            },
            include: {
              branch: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    const formattedUsers = users.map((user: any) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      joinedAt: user.createdAt,
      likedBranches: user.branchLikes.map((bl: any) => ({
        id: bl.branch.id,
        name: bl.branch.name,
        likedAt: (bl as any).createdAt,
      })),
    }));

    return {
      users: formattedUsers,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    };
  }
}

export default BranchService.getInstance();

