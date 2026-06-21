import { Request, Response } from "express";
import { verifyToken } from "@clerk/clerk-sdk-node";
import { Prisma, PrismaClient } from "@prisma/client";
import DatabaseSingleton from "../config/database";
import { type RBACRequest } from "../middleware/rbac";
import type { OrganizationContextRequest } from "../middleware/organizationContext";
import { hasImplicitFullAccess } from "../config/permissions";
import { getAddonPriceAndTax } from "../utils/addonPriceHelper";
import {
  filterMealIdsAvailableNow,
  getBranchTimeZone,
  isMealAvailableNow,
} from "../utils/mealAvailabilityHelper";

const getIssuerCandidates = (): string[] => {
  const raw = process.env.CLERK_ISSUER_URL;
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

const prisma = DatabaseSingleton.getInstance().getPrisma();

const ensureFeaturedMealOrdering = async (organizationId: string) => {
  const featuredWithoutOrder = await prisma.meal.count({
    where: { organizationId, isFeatured: true, featuredOrder: 0 },
  });

  if (featuredWithoutOrder > 0) {
    const featuredMeals = await prisma.meal.findMany({
      where: { organizationId, isFeatured: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    await prisma.$transaction(
      featuredMeals.map((meal, index) =>
        prisma.meal.update({
          where: { id: meal.id },
          data: { featuredOrder: index + 1 },
        })
      )
    );
  }
};

const resolveOrganizationIdForPublicMenu = async (req: Request): Promise<string | null> => {
  const headerVal = req.headers["x-organization-id"];
  if (typeof headerVal === "string" && headerVal.trim()) {
    const org = await prisma.organization.findUnique({
      where: { id: headerVal.trim() },
      select: { id: true },
    });
    return org?.id || null;
  }

  // If called from an authenticated admin/staff client but the org header is missing,
  // fall back to the organization on the authenticated user.
  // This prevents accidental fallback to the default org (which would return empty meals).
  try {
    const authHeader = (req.headers?.authorization || req.headers?.Authorization) as string | undefined;
    if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice("bearer ".length).trim();
      if (token) {
        const issuers = getIssuerCandidates();
        let decoded: any | null = null;
        for (const issuer of issuers) {
          try {
            decoded = await verifyToken(token, { issuer });
            break;
          } catch {
            // try next issuer
          }
        }
        const clerkId = (decoded as any)?.sub as string | undefined;
        if (clerkId) {
          const user = await prisma.user.findUnique({
            where: { clerkId },
            select: { organizationId: true },
          });
          if (user?.organizationId) return user.organizationId;
        }
      }
    }
  } catch {
    // ignore
  }

  const branchId = (req.query as any)?.branchId;
  if (typeof branchId === "string" && branchId.trim()) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId.trim() },
      select: { organizationId: true },
    });
    if (branch?.organizationId) return branch.organizationId;
  }

  const defaultOrg = await prisma.organization.findUnique({
    where: { slug: "default" },
    select: { id: true },
  });
  return defaultOrg?.id || null;
};

const getNextCategoryListOrder = async (
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  categoryId: string
) => {
  const stats = await tx.meal.aggregate({
    where: { organizationId, categoryId },
    _max: { listOrder: true },
  });

  return (stats._max.listOrder ?? 0) + 1;
};

export const mealController = {
  // Get all meals with pagination and search
  getMeals: async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrganizationIdForPublicMenu(req);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      await ensureFeaturedMealOrdering(organizationId);
      const {
        page = "1",
        limit = "10",
        search = "",
        sortBy = "createdAt",
        sortOrder = "desc",
        categoryId = "",
        isFeatured,
        status = "",
        branchId = "",
      } = req.query;

      const branchIdStr = typeof branchId === "string" ? branchId.trim() : "";

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const whereClause: any = { organizationId };
      
      // Only filter by category active status for public/unauthenticated requests
      // Admin users should see all meals regardless of category active status
      if (!req.headers.authorization) {
        whereClause.category = {
          isActive: true
        };
      }

      if (search) {
        whereClause.OR = [
          {
            name: {
              contains: search as string,
              mode: "insensitive" as const,
            },
          },
          {
            description: {
              contains: search as string,
              mode: "insensitive" as const,
            },
          },
        ];
      }

      if (categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: categoryId as string },
          select: { id: true, organizationId: true },
        });
        if (!category || (category as any).organizationId !== organizationId) {
          return res.json({
            success: true,
            data: {
              meals: [],
              pagination: {
                currentPage: pageNum,
                totalPages: 0,
                totalCount: 0,
                hasNext: false,
                hasPrev: false,
              },
            },
          });
        }

        whereClause.categoryId = categoryId;
      }

      if (branchIdStr) {
        whereClause.NOT = {
          OR: [
            {
              excludedBranches: {
                has: branchIdStr,
              },
            },
            {
              category: {
                excludedBranches: {
                  has: branchIdStr,
                },
              },
            },
          ],
        };
      }

      if (isFeatured !== undefined) {
        whereClause.isFeatured = String(isFeatured) === "true";
      }

      if (status === "ACTIVE") {
        whereClause.isActive = true;
      } else if (status === "INACTIVE") {
        whereClause.isActive = false;
      }

      // For public (unauthenticated) branch menus, filter out meals that are not available *now*.
      // Admin/staff clients typically call without branchId or with auth, and should not be silently filtered.
      const shouldApplyAvailabilityFilter = Boolean(branchIdStr) && !req.headers.authorization;
      if (shouldApplyAvailabilityFilter) {
        const candidateIds = await prisma.meal.findMany({
          where: whereClause,
          select: { id: true },
        });
        const availableIds = await filterMealIdsAvailableNow({
          prisma: prisma as any,
          branchId: branchIdStr,
          mealIds: candidateIds.map((m) => m.id),
        });
        whereClause.id = {
          in: availableIds.length > 0 ? availableIds : ["__none__"],
        };
      }

      let orderByClause:
        | Prisma.MealOrderByWithRelationInput
        | Prisma.MealOrderByWithRelationInput[];

      if (sortBy === "listOrder") {
        orderByClause = [
          { listOrder: sortOrder as "asc" | "desc" },
          { createdAt: "desc" },
        ];
      } else if (sortBy === "featuredOrder") {
        orderByClause = [
          { featuredOrder: sortOrder as "asc" | "desc" },
          { createdAt: "desc" },
        ];
      } else {
        orderByClause = {
          [sortBy as string]: sortOrder as "asc" | "desc",
        };
      }

      const [meals, totalCount] = await Promise.all([
        prisma.meal.findMany({
          where: whereClause,
          skip,
          take: limitNum,
          orderBy: orderByClause,
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            mealSizes: true,
            branchAvailabilities: branchIdStr
              ? {
                  where: { branchId: branchIdStr },
                  include: { windows: true },
                }
              : false,
            mealAddOns: {
              ...(branchIdStr
                ? {
                    where: {
                      addOn: {
                        isActive: true,
                        NOT: {
                          excludedBranches: {
                            has: branchIdStr,
                          },
                        },
                      },
                    },
                  }
                : { where: { addOn: { isActive: true } } }),
              include: {
                addOn: {
                  include: {
                    addonSizes: true,
                  },
                },
              },
            },
            mealDeclarations: {
              include: {
                declaration: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    description: true,
                    icon: true,
                  },
                },
              },
            },
            mealOptionalIngredients: {
              include: {
                optionalIngredient: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                  },
                },
              },
            },
            branchPrices: branchIdStr
              ? {
                  where: { branchId: branchIdStr },
                  select: { id: true, branchId: true, basePrice: true, taxPercentage: true },
                }
              : false,
            _count: {
              select: {
                orderItems: true,
              },
            },
          },
        }),
        prisma.meal.count({ where: whereClause }),
      ]);

      // Apply branch-specific effective pricing/tax and strip branchPrices from payload
      const mealsWithEffective = meals.map((meal: any) => {
        const mealData: any = { ...meal };
        if (
          branchId &&
          typeof branchId === "string" &&
          meal.branchPrices &&
          Array.isArray(meal.branchPrices) &&
          meal.branchPrices.length > 0
        ) {
          const branchPrice = meal.branchPrices[0];
          const effectiveBasePrice = Number(branchPrice.basePrice);
          const effectiveTaxPercentage =
            branchPrice.taxPercentage !== null ? Number(branchPrice.taxPercentage) : null;
          mealData.effectiveBasePrice = effectiveBasePrice;
          mealData.effectiveTaxPercentage = effectiveTaxPercentage;
          // For compatibility with existing clients, override basePrice when branch pricing exists
          mealData.basePrice = effectiveBasePrice;
          mealData.taxPercentage =
            effectiveTaxPercentage !== null ? effectiveTaxPercentage : mealData.taxPercentage;
        } else {
          mealData.effectiveBasePrice = Number(meal.basePrice);
          mealData.effectiveTaxPercentage =
            meal.taxPercentage !== null ? Number(meal.taxPercentage) : null;
        }

        if (mealData.branchPrices) {
          delete mealData.branchPrices;
        }
        return mealData;
      });

      const totalPages = Math.ceil(totalCount / limitNum);

      return res.json({
        success: true,
        data: {
          meals: mealsWithEffective,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalCount,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching meals:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch meals",
      });
    }
  },

  // Get single meal by ID
  getMealById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { branchId } = req.query;
      const branchIdStr = typeof branchId === "string" ? branchId.trim() : null;

      const organizationId = await resolveOrganizationIdForPublicMenu(req);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const meal = await prisma.meal.findUnique({
        where: { id },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              excludedBranches: branchIdStr ? true : false,
            },
          },
          mealSizes: true,
          branchAvailabilities: branchIdStr
            ? {
                where: { branchId: branchIdStr },
                include: { windows: true },
              }
            : {
                include: { windows: true },
              },
          mealAddOns: {
            ...(branchIdStr
              ? {
                  where: {
                    addOn: {
                      isActive: true,
                      NOT: {
                        excludedBranches: {
                          has: branchIdStr,
                        },
                      },
                    },
                  },
                }
              : { where: { addOn: { isActive: true } } }),
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                },
              },
            },
          },
          mealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          mealOptionalIngredients: {
            include: {
              optionalIngredient: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                },
              },
            },
          },
          branchPrices: branchIdStr
            ? {
                where: { branchId: branchIdStr },
                select: {
                  id: true,
                  branchId: true,
                  basePrice: true,
                  taxPercentage: true,
                },
              }
            : false,
          _count: {
            select: {
              orderItems: true,
            },
          },
        },
      });

      if (!meal || (meal as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Meal not found",
        });
      }

      if (branchIdStr) {
        const excluded =
          (Array.isArray((meal as any).excludedBranches) && (meal as any).excludedBranches.includes(branchIdStr)) ||
          (Array.isArray((meal as any)?.category?.excludedBranches) &&
            (meal as any).category.excludedBranches.includes(branchIdStr));

        if (excluded) {
          return res.status(404).json({
            success: false,
            message: "Meal not found",
          });
        }
      }

      // Note: Do NOT enforce time-window availability via 404 here.
      // Customers should still be able to view the meal details page, see an explanation,
      // and be prevented from adding to cart client-side.

      // Calculate effective price if branchId is provided
      const mealData: any = { ...meal };
      if (branchIdStr && meal.branchPrices && Array.isArray(meal.branchPrices) && meal.branchPrices.length > 0) {
        // Use branch-specific price
        const branchPrice = meal.branchPrices[0];
        mealData.effectiveBasePrice = Number(branchPrice.basePrice);
        mealData.effectiveTaxPercentage = branchPrice.taxPercentage !== null ? Number(branchPrice.taxPercentage) : null;
      } else {
        // Use default base price
        mealData.effectiveBasePrice = Number(meal.basePrice);
        mealData.effectiveTaxPercentage = meal.taxPercentage !== null ? Number(meal.taxPercentage) : null;
      }
      
      // Remove branchPrices from response (we've already extracted the needed info)
      if (mealData.branchPrices) {
        delete mealData.branchPrices;
      }

      // Calculate effective prices for addons if branchId is provided
      if (branchIdStr && mealData.mealAddOns) {
        mealData.mealAddOns = await Promise.all(
          mealData.mealAddOns.map(async (mealAddOn: any) => {
            if (mealAddOn.addOn) {
              const { basePrice, taxPercentage } = await getAddonPriceAndTax(
                mealAddOn.addOn.id,
                branchIdStr
              );
              return {
                ...mealAddOn,
                addOn: {
                  ...mealAddOn.addOn,
                  effectiveBasePrice: basePrice,
                  effectiveTaxPercentage: taxPercentage,
                  // Remove addonBranchPrices from response (we've already extracted the needed info)
                  addonBranchPrices: undefined,
                },
              };
            }
            return mealAddOn;
          })
        );
      } else if (mealData.mealAddOns) {
        // No branchId, use default addon prices
        mealData.mealAddOns = mealData.mealAddOns.map((mealAddOn: any) => {
          if (mealAddOn.addOn) {
            return {
              ...mealAddOn,
              addOn: {
                ...mealAddOn.addOn,
                effectiveBasePrice: mealAddOn.addOn.price !== null ? Number(mealAddOn.addOn.price) : 0,
                effectiveTaxPercentage: mealAddOn.addOn.taxPercentage !== null ? Number(mealAddOn.addOn.taxPercentage) : null,
              },
            };
          }
          return mealAddOn;
        });
      }

      return res.json({
        success: true,
        data: mealData,
      });
    } catch (error) {
      console.error("Error fetching meal:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch meal",
      });
    }
  },

  // Create new meal
  createMeal: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const {
        name,
        description,
        sku,
        basePrice,
        taxPercentage,
        image,
        categoryId,
        sizes = [],
        addOnIds = [],
        declarationIds = [],
        optionalIngredientIds = [],
        excludedBranches = [],
        isActive = true,
        isFeatured = false,
        isDrink = false,
      } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Meal name is required",
        });
      }

      if (!basePrice || basePrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Base price is required and must be non-negative",
        });
      }

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: "Category is required",
        });
      }

      // Check if category exists
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, organizationId: true },
      });

      if (!category || (category as any).organizationId !== organizationId) {
        return res.status(400).json({
          success: false,
          message: "Category not found",
        });
      }

      // Check for duplicate SKU within organization (both meals and deals)
      if (sku && sku.trim()) {
        const trimmedSku = sku.trim();
        const existingSkuMeal = await prisma.meal.findFirst({
          where: {
            organizationId,
            sku: trimmedSku,
          },
          select: { id: true },
        });
        if (existingSkuMeal) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
        const existingSkuDeal = await prisma.deal.findFirst({
          where: {
            organizationId,
            sku: trimmedSku,
          },
          select: { id: true },
        });
        if (existingSkuDeal) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
      }

      const excludedBranchIds: string[] = Array.isArray(excludedBranches)
        ? excludedBranches.filter((v: any) => typeof v === "string" && v.trim().length > 0)
        : [];

      if (excludedBranchIds.length > 0) {
        const count = await prisma.branch.count({
          where: { id: { in: excludedBranchIds }, organizationId },
        });
        if (count !== excludedBranchIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more excludedBranches do not belong to this organization",
          });
        }
      }

      if (Array.isArray(addOnIds) && addOnIds.length > 0) {
        const count = await prisma.addOn.count({
          where: { id: { in: addOnIds }, organizationId },
        });
        if (count !== addOnIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more addOnIds are invalid",
          });
        }
      }

      // Create meal with transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the meal
        let nextFeaturedOrder = 0;
        if (Boolean(isFeatured)) {
          const featuredStats = await tx.meal.aggregate({
            where: { organizationId, isFeatured: true },
            _max: { featuredOrder: true },
          });
          nextFeaturedOrder = (featuredStats._max.featuredOrder ?? 0) + 1;
        }

        const nextListOrder = await getNextCategoryListOrder(tx, organizationId, categoryId);

        const meal = await tx.meal.create({
          data: {
            organizationId,
            name: name.trim(),
            description: description?.trim() || null,
            sku: sku?.trim() || null,
            basePrice: parseFloat(basePrice),
            taxPercentage:
              taxPercentage !== undefined ? parseFloat(taxPercentage) : null,
            image: image?.trim() || null,
            categoryId,
            excludedBranches: excludedBranchIds,
            isActive: Boolean(isActive),
            isFeatured: Boolean(isFeatured),
            isDrink: Boolean(isDrink),
            featuredOrder: Boolean(isFeatured) ? nextFeaturedOrder : 0,
            listOrder: nextListOrder,
          } as any,
        });

        // Create meal sizes if provided
        if (sizes && sizes.length > 0) {
          await tx.mealSize.createMany({
            data: sizes.map((size: any) => ({
              name: size.name,
              sizeType: size.sizeType || "M", // Default to M if not provided
              price: parseFloat(size.price),
              taxPercentage:
                size.taxPercentage !== undefined
                  ? parseFloat(size.taxPercentage)
                  : null,
              mealId: meal.id,
            })),
          });
        }

        // Create meal addon relationships if provided
        if (addOnIds && addOnIds.length > 0) {
          await tx.mealAddOn.createMany({
            data: addOnIds.map((addOnId: string) => ({
              mealId: meal.id,
              addOnId,
            })),
          });
        }

        // Create meal declaration relationships if provided
        if (declarationIds && declarationIds.length > 0) {
          await tx.mealDeclaration.createMany({
            data: declarationIds.map((declarationId: string) => ({
              mealId: meal.id,
              declarationId,
            })),
          });
        }

        // Create meal optional ingredient relationships if provided
        if (optionalIngredientIds && optionalIngredientIds.length > 0) {
          await tx.mealOptionalIngredient.createMany({
            data: optionalIngredientIds.map((optionalIngredientId: string) => ({
              mealId: meal.id,
              optionalIngredientId,
            })),
          });
        }

        return meal;
      });

      // Fetch the complete meal with relations
      const completeMeal = await prisma.meal.findUnique({
        where: { id: result.id },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          mealSizes: true,
          mealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                },
              },
            },
          },
          mealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          mealOptionalIngredients: {
            include: {
              optionalIngredient: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                },
              },
            },
          },
          _count: {
            select: {
              orderItems: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: completeMeal,
        message: "Meal created successfully",
      });
    } catch (error) {
      console.error("Error creating meal:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create meal",
      });
    }
  },

  // Update meal
  updateMeal: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;
      const {
        name,
        description,
        sku,
        basePrice,
        taxPercentage,
        image,
        categoryId,
        sizes = [],
        addOnIds = [],
        declarationIds = [],
        optionalIngredientIds,
        excludedBranches,
        isActive,
        isFeatured,
        isDrink,
      } = req.body;

      // Check if meal exists
      const existingMeal = await prisma.meal.findUnique({
        where: { id },
      });

      if (!existingMeal) {
        return res.status(404).json({
          success: false,
          message: "Meal not found",
        });
      }

      const existingMealOrgId = (existingMeal as any).organizationId as string | null | undefined;
      if (existingMealOrgId && existingMealOrgId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Meal not found",
        });
      }

      // Check if category exists (if provided)
      if (categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
          select: { id: true, organizationId: true },
        });

        if (!category || (category as any).organizationId !== organizationId) {
          return res.status(400).json({
            success: false,
            message: "Category not found",
          });
        }
      }

      if (excludedBranches !== undefined) {
        const excludedBranchIds: string[] = Array.isArray(excludedBranches)
          ? excludedBranches.filter((v: any) => typeof v === "string" && v.trim().length > 0)
          : [];
        if (excludedBranchIds.length > 0) {
          const count = await prisma.branch.count({
            where: { id: { in: excludedBranchIds }, organizationId },
          });
          if (count !== excludedBranchIds.length) {
            return res.status(400).json({
              success: false,
              message: "One or more excludedBranches do not belong to this organization",
            });
          }
        }
      }

      if (addOnIds !== undefined && Array.isArray(addOnIds) && addOnIds.length > 0) {
        const count = await prisma.addOn.count({
          where: { id: { in: addOnIds }, organizationId },
        });
        if (count !== addOnIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more addOnIds are invalid",
          });
        }
      }

      // Check for duplicate SKU within organization (excluding current meal, checking both meals and deals)
      if (sku !== undefined && sku.trim()) {
        const trimmedSku = sku.trim();
        const existingSkuMeal = await prisma.meal.findFirst({
          where: {
            organizationId,
            sku: trimmedSku,
            id: { not: id }, // Exclude current meal
          },
          select: { id: true },
        });
        if (existingSkuMeal) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
        const existingSkuDeal = await prisma.deal.findFirst({
          where: {
            organizationId,
            sku: trimmedSku,
          },
          select: { id: true },
        });
        if (existingSkuDeal) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
      }

      // Update meal with transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update the meal
        const updateData: any = {};

        // Legacy multi-org migration: if this meal is unscoped (organizationId null),
        // claim it into the resolved organization on first edit.
        if (!existingMealOrgId) {
          updateData.organizationId = organizationId;
        }
        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined)
          updateData.description = description?.trim() || null;
        if (sku !== undefined) updateData.sku = sku?.trim() || null;
        if (basePrice !== undefined)
          updateData.basePrice = parseFloat(basePrice);
        if (taxPercentage !== undefined) {
          updateData.taxPercentage =
            taxPercentage === null || taxPercentage === ""
              ? null
              : parseFloat(taxPercentage);
        }
        if (image !== undefined) updateData.image = image?.trim() || null;

        if (categoryId !== undefined && categoryId !== existingMeal.categoryId) {
          updateData.categoryId = categoryId;
          updateData.listOrder = await getNextCategoryListOrder(
            tx,
            organizationId,
            categoryId
          );
        } else if (categoryId !== undefined) {
          updateData.categoryId = categoryId;
        }

        if (isActive !== undefined) updateData.isActive = Boolean(isActive);
        if (excludedBranches !== undefined) {
          updateData.excludedBranches = Array.isArray(excludedBranches)
            ? excludedBranches.filter((v: any) => typeof v === "string" && v.trim().length > 0)
            : [];
        }

        if (isDrink !== undefined) {
          updateData.isDrink = Boolean(isDrink);
        }
        if (isFeatured !== undefined) {
          const nextState = Boolean(isFeatured);
          if (nextState && !existingMeal.isFeatured) {
            const featuredStats = await tx.meal.aggregate({
              where: { organizationId, isFeatured: true },
              _max: { featuredOrder: true },
            });
            updateData.featuredOrder =
              (featuredStats._max.featuredOrder ?? 0) + 1;
            updateData.isFeatured = true;
          } else if (!nextState && existingMeal.isFeatured) {
            updateData.isFeatured = false;
            updateData.featuredOrder = 0;
          } else {
            updateData.isFeatured = nextState;
          }
        }

        const meal = await tx.meal.update({
          where: { id },
          data: updateData as any,
        });

        // Update meal sizes
        if (sizes !== undefined) {
          // Delete existing sizes
          await tx.mealSize.deleteMany({
            where: { mealId: id },
          });

          // Create new sizes
          if (sizes.length > 0) {
            await tx.mealSize.createMany({
              data: sizes.map((size: any) => ({
                name: size.name,
                sizeType: size.sizeType || "M", // Default to M if not provided
                price: parseFloat(size.price),
                taxPercentage:
                  size.taxPercentage !== undefined
                    ? parseFloat(size.taxPercentage)
                    : null,
                mealId: id,
              })),
            });
          }
        }

        // Update meal addon relationships
        if (addOnIds !== undefined) {
          // Delete existing addon relationships
          await tx.mealAddOn.deleteMany({
            where: { mealId: id },
          });

          // Create new addon relationships
          if (addOnIds.length > 0) {
            await tx.mealAddOn.createMany({
              data: addOnIds.map((addOnId: string) => ({
                mealId: id,
                addOnId,
              })),
            });
          }
        }

        // Update meal declaration relationships
        if (declarationIds !== undefined) {
          // Delete existing declaration relationships
          await tx.mealDeclaration.deleteMany({
            where: { mealId: id },
          });

          // Create new declaration relationships
          if (declarationIds.length > 0) {
            await tx.mealDeclaration.createMany({
              data: declarationIds.map((declarationId: string) => ({
                mealId: id,
                declarationId,
              })),
            });
          }
        }

        // Update meal optional ingredient relationships
        if (optionalIngredientIds !== undefined) {
          // Delete existing optional ingredient relationships
          await tx.mealOptionalIngredient.deleteMany({
            where: { mealId: id },
          });

          // Create new optional ingredient relationships
          if (optionalIngredientIds.length > 0) {
            await tx.mealOptionalIngredient.createMany({
              data: optionalIngredientIds.map(
                (optionalIngredientId: string) => ({
                  mealId: id,
                  optionalIngredientId,
                })
              ),
            });
          }
        }

        return meal;
      });

      // Fetch the complete meal with relations
      const completeMeal = await prisma.meal.findUnique({
        where: { id: result.id },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          mealSizes: true,
          mealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                },
              },
            },
          },
          mealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          mealOptionalIngredients: {
            include: {
              optionalIngredient: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                },
              },
            },
          },
          _count: {
            select: {
              orderItems: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: completeMeal,
        message: "Meal updated successfully",
      });
    } catch (error) {
      console.error("Error updating meal:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update meal",
      });
    }
  },

  // Delete meal
  deleteMeal: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      // Check if meal exists
      const existingMeal = await prisma.meal.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              orderItems: true,
            },
          },
        },
      });

      if (!existingMeal) {
        return res.status(404).json({
          success: false,
          message: "Meal not found",
        });
      }

      // Check if meal has orders
      if (existingMeal._count.orderItems > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete meal. It has ${existingMeal._count.orderItems} order(s) associated with it.`,
        });
      }

      await prisma.meal.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: "Meal deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting meal:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete meal",
      });
    }
  },

  // Toggle meal status
  toggleMealStatus: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      const meal = await prisma.meal.findUnique({
        where: { id },
      });

      if (!meal || (meal as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Meal not found",
        });
      }

      const updatedMeal = await prisma.meal.update({
        where: { id },
        data: {
          isActive: !meal.isActive,
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          mealSizes: true,
          mealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                },
              },
            },
          },
          mealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          _count: {
            select: {
              orderItems: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: updatedMeal,
        message: `Meal ${
          updatedMeal.isActive ? "activated" : "deactivated"
        } successfully`,
      });
    } catch (error) {
      console.error("Error toggling meal status:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to toggle meal status",
      });
    }
  },

  reorderFeaturedMeals: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { meals } = req.body as {
        meals: { id: string; order?: number }[];
      };

      if (!Array.isArray(meals) || meals.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Meal order payload is required.",
        });
      }

      const seenIds = new Set<string>();
      for (const meal of meals) {
        if (!meal.id || typeof meal.id !== "string") {
          return res.status(400).json({
            success: false,
            message: "Each meal must include a valid id.",
          });
        }
        if (seenIds.has(meal.id)) {
          return res.status(400).json({
            success: false,
            message: "Duplicate meal ids are not allowed.",
          });
        }
        seenIds.add(meal.id);
      }

      await ensureFeaturedMealOrdering(organizationId);

      const dbMeals = await prisma.meal.findMany({
        where: { id: { in: meals.map((m) => m.id) }, organizationId },
        select: { id: true },
      });

      if (dbMeals.length !== meals.length) {
        return res.status(404).json({
          success: false,
          message: "One or more meals do not exist",
        });
      }

      await prisma.$transaction(
        meals.map((meal, index) => {
          const orderValue =
            meal.order && Number.isFinite(meal.order)
              ? Number(meal.order)
              : index + 1;
          return prisma.meal.update({
            where: { id: meal.id },
            data: { featuredOrder: orderValue },
          });
        })
      );

      return res.json({
        success: true,
        message: "Featured meals reordered successfully",
      });
    } catch (error) {
      console.error("Error reordering featured meals:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reorder featured meals",
      });
    }
  },

  reorderCategoryMeals: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { categoryId, meals } = req.body as {
        categoryId?: string;
        meals: { id: string; order?: number }[];
      };

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: "Category id is required.",
        });
      }

      if (!Array.isArray(meals) || meals.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Meal order payload is required.",
        });
      }

      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, organizationId: true },
      });

      if (!category || (category as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Category not found.",
        });
      }

      const seenIds = new Set<string>();
      for (const meal of meals) {
        if (!meal.id || typeof meal.id !== "string") {
          return res.status(400).json({
            success: false,
            message: "Each meal must include a valid id.",
          });
        }
        if (seenIds.has(meal.id)) {
          return res.status(400).json({
            success: false,
            message: "Duplicate meal ids are not allowed.",
          });
        }
        seenIds.add(meal.id);
      }

      const categoryMeals = await prisma.meal.findMany({
        where: { id: { in: meals.map((meal) => meal.id) }, organizationId },
        select: { id: true, categoryId: true },
      });

      if (categoryMeals.length !== meals.length) {
        return res.status(400).json({
          success: false,
          message: "One or more meals do not exist.",
        });
      }

      const invalidMeal = categoryMeals.find(
        (meal) => meal.categoryId !== categoryId
      );

      if (invalidMeal) {
        return res.status(400).json({
          success: false,
          message: "All meals must belong to the specified category.",
        });
      }

      const remainingMeals = await prisma.meal.findMany({
        where: {
          categoryId,
          id: { notIn: meals.map((meal) => meal.id) },
        },
        select: { id: true },
        orderBy: { listOrder: "asc" },
      });

      let currentOrder = 0;
      const updates = [];

      for (const meal of meals) {
        currentOrder += 1;
        const orderValue =
          meal.order && Number.isFinite(meal.order)
            ? Number(meal.order)
            : currentOrder;
        updates.push(
          prisma.meal.update({
            where: { id: meal.id },
            data: { listOrder: orderValue },
          })
        );
        currentOrder = orderValue;
      }

      for (const meal of remainingMeals) {
        currentOrder += 1;
        updates.push(
          prisma.meal.update({
            where: { id: meal.id },
            data: { listOrder: currentOrder },
          })
        );
      }

      await prisma.$transaction(updates);

      return res.json({
        success: true,
        message: "Category meals reordered successfully",
      });
    } catch (error) {
      console.error("Error reordering category meals:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reorder category meals",
      });
    }
  },

  // Get branch prices for a meal
  getMealBranchPrices: async (req: Request, res: Response) => {
    try {
      const { mealId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;

      const rbacUser = (req as RBACRequest).rbacUser;
      if (!rbacUser) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const orgRole = (rbacUser as any).orgRole as string | null | undefined;
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      if ((isSuperAdmin || isOrgAdmin) && !organizationId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      if (organizationId) {
        const meal = await prisma.meal.findUnique({
          where: { id: mealId },
          select: { id: true, organizationId: true },
        });

        if (!meal) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }

        const mealOrgId = (meal as any).organizationId as string | null | undefined;
        if (mealOrgId && mealOrgId !== organizationId) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }
      }

      let allowedBranchIds: string[] | null = null;
      if (isOrgAdmin && organizationId) {
        const branches = await prisma.branch.findMany({
          where: { organizationId },
          select: { id: true },
        });
        allowedBranchIds = branches.map((b) => b.id);
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
      } else if (!isSuperAdmin) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
      }

      const branchPrices = await prisma.mealBranchPrice.findMany({
        where: {
          mealId,
          ...(allowedBranchIds
            ? {
                branchId:
                  allowedBranchIds.length === 1
                    ? allowedBranchIds[0]
                    : { in: allowedBranchIds },
              }
            : {}),
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: {
          branch: {
            name: "asc",
          },
        },
      });

      return res.json({
        success: true,
        data: branchPrices,
      });
    } catch (error) {
      console.error("Error fetching meal branch prices:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch meal branch prices",
      });
    }
  },

  // Create or update branch price for a meal
  upsertMealBranchPrice: async (req: Request, res: Response) => {
    try {
      const { mealId } = req.params;
      const { branchId, basePrice, taxPercentage } = req.body;

      const organizationId = (req as any).organizationId as string | undefined;

      const rbacUser = (req as RBACRequest).rbacUser;
      if (!rbacUser) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const orgRole = (rbacUser as any).orgRole as string | null | undefined;
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      if ((isSuperAdmin || isOrgAdmin) && !organizationId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      if (organizationId && branchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: { id: true, organizationId: true },
        });
        if (!branch || branch.organizationId !== organizationId) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }
      }

      if (!isSuperAdmin && !isOrgAdmin) {
        const allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
        if (branchId && !allowedBranchIds.includes(branchId)) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }
      }

      if (!branchId || basePrice === undefined) {
        return res.status(400).json({
          success: false,
          message: "branchId and basePrice are required",
        });
      }

      // Verify meal exists
      const meal = await prisma.meal.findUnique({
        where: { id: mealId },
      });

      if (!meal) {
        return res.status(404).json({
          success: false,
          message: "Meal not found",
        });
      }

      if (organizationId) {
        const mealOrgId = (meal as any).organizationId as string | null | undefined;
        if (mealOrgId && mealOrgId !== organizationId) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }
      }

      // Verify branch exists
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      });

      if (!branch) {
        return res.status(404).json({
          success: false,
          message: "Branch not found",
        });
      }

      const branchPrice = await prisma.mealBranchPrice.upsert({
        where: {
          mealId_branchId: {
            mealId,
            branchId,
          },
        },
        update: {
          basePrice: parseFloat(basePrice),
          taxPercentage:
            taxPercentage !== undefined && taxPercentage !== null
              ? parseFloat(taxPercentage)
              : null,
        },
        create: {
          mealId,
          branchId,
          basePrice: parseFloat(basePrice),
          taxPercentage:
            taxPercentage !== undefined && taxPercentage !== null
              ? parseFloat(taxPercentage)
              : null,
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: branchPrice,
        message: "Branch price saved successfully",
      });
    } catch (error) {
      console.error("Error upserting meal branch price:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to save meal branch price",
      });
    }
  },

  // Delete branch price for a meal
  deleteMealBranchPrice: async (req: Request, res: Response) => {
    try {
      const { mealId, branchId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;

      const rbacUser = (req as RBACRequest).rbacUser;
      if (!rbacUser) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const orgRole = (rbacUser as any).orgRole as string | null | undefined;
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      if ((isSuperAdmin || isOrgAdmin) && !organizationId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      if (organizationId) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: { id: true, organizationId: true },
        });
        if (!branch || branch.organizationId !== organizationId) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }

        const meal = await prisma.meal.findUnique({
          where: { id: mealId },
          select: { id: true, organizationId: true },
        });
        if (!meal) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }

        const mealOrgId = (meal as any).organizationId as string | null | undefined;
        if (mealOrgId && mealOrgId !== organizationId) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }
      }

      if (!isSuperAdmin && !isOrgAdmin) {
        const allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
        if (!allowedBranchIds.includes(branchId)) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }
      }

      await prisma.mealBranchPrice.delete({
        where: {
          mealId_branchId: {
            mealId,
            branchId,
          },
        },
      });

      return res.json({
        success: true,
        message: "Branch price deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting meal branch price:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete meal branch price",
      });
    }
  },

  // Get branch availability for a meal
  getMealBranchAvailability: async (req: Request, res: Response) => {
    try {
      const { mealId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;

      const rbacUser = (req as RBACRequest).rbacUser;
      if (!rbacUser) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const orgRole = (rbacUser as any).orgRole as string | null | undefined;
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      if ((isSuperAdmin || isOrgAdmin) && !organizationId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      if (organizationId) {
        const meal = await prisma.meal.findUnique({
          where: { id: mealId },
          select: { id: true, organizationId: true },
        });
        if (!meal) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }

        const mealOrgId = (meal as any).organizationId as string | null | undefined;
        if (mealOrgId && mealOrgId !== organizationId) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }
      }

      let allowedBranchIds: string[] | null = null;
      if (isOrgAdmin && organizationId) {
        const branches = await prisma.branch.findMany({
          where: { organizationId },
          select: { id: true, name: true, code: true },
          orderBy: { name: "asc" },
        });
        allowedBranchIds = branches.map((b) => b.id);
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
      } else if (!isSuperAdmin) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
      }

      const branchAvailabilities = await (prisma as any).mealBranchAvailability.findMany({
        where: {
          mealId,
          ...(allowedBranchIds
            ? {
                branchId:
                  allowedBranchIds.length === 1
                    ? allowedBranchIds[0]
                    : { in: allowedBranchIds },
              }
            : {}),
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              timezone: true,
            },
          },
          windows: true,
        },
        orderBy: {
          branch: {
            name: "asc",
          },
        },
      });

      return res.json({
        success: true,
        data: branchAvailabilities,
      });
    } catch (error) {
      console.error("Error fetching meal branch availability:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch meal branch availability",
      });
    }
  },

  // Create or update branch availability for a meal
  upsertMealBranchAvailability: async (req: Request, res: Response) => {
    try {
      const { mealId } = req.params;
      const { branchId, isAvailableAllWeek, windows } = req.body as any;

      const organizationId = (req as any).organizationId as string | undefined;

      const rbacUser = (req as RBACRequest).rbacUser;
      if (!rbacUser) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const orgRole = (rbacUser as any).orgRole as string | null | undefined;
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      if ((isSuperAdmin || isOrgAdmin) && !organizationId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      if (!branchId || typeof branchId !== "string") {
        return res.status(400).json({ success: false, message: "branchId is required" });
      }

      if (organizationId) {
        const branch = await (prisma as any).branch.findUnique({
          where: { id: branchId },
          select: { id: true, organizationId: true },
        });
        if (!branch || branch.organizationId !== organizationId) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }
      }

      if (!isSuperAdmin && !isOrgAdmin) {
        const allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
        if (!allowedBranchIds.includes(branchId)) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }
      }

      // Verify meal exists
      const meal = await prisma.meal.findUnique({ where: { id: mealId } });
      if (!meal) {
        return res.status(404).json({ success: false, message: "Meal not found" });
      }

      if (organizationId) {
        const mealOrgId = (meal as any).organizationId as string | null | undefined;
        if (mealOrgId && mealOrgId !== organizationId) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }
      }

      const allWeek = Boolean(isAvailableAllWeek);
      const normalizedWindows: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [];
      if (!allWeek) {
        if (!Array.isArray(windows) || windows.length === 0) {
          return res.status(400).json({ success: false, message: "windows are required when isAvailableAllWeek is false" });
        }

        for (const w of windows) {
          const day = Number((w as any)?.dayOfWeek);
          const startTime = String((w as any)?.startTime || "").trim();
          const endTime = String((w as any)?.endTime || "").trim();
          const validTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime) && /^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime);
          if (!Number.isFinite(day) || day < 0 || day > 6 || !validTime) {
            return res.status(400).json({ success: false, message: "Invalid windows payload" });
          }
          normalizedWindows.push({ dayOfWeek: day, startTime, endTime });
        }
      }

      const saved = await prisma.$transaction(async (tx) => {
        const availability = await (tx as any).mealBranchAvailability.upsert({
          where: {
            mealId_branchId: {
              mealId,
              branchId,
            },
          },
          update: {
            isAvailableAllWeek: allWeek,
          },
          create: {
            mealId,
            branchId,
            isAvailableAllWeek: allWeek,
          },
        });

        await (tx as any).mealBranchAvailabilityWindow.deleteMany({
          where: { availabilityId: availability.id },
        });

        if (!allWeek && normalizedWindows.length > 0) {
          await (tx as any).mealBranchAvailabilityWindow.createMany({
            data: normalizedWindows.map((w) => ({
              availabilityId: availability.id,
              dayOfWeek: w.dayOfWeek,
              startTime: w.startTime,
              endTime: w.endTime,
            })),
          });
        }

        return (tx as any).mealBranchAvailability.findUnique({
          where: { id: availability.id },
          include: { windows: true, branch: { select: { id: true, name: true, code: true, timezone: true } } },
        });
      });

      return res.json({
        success: true,
        data: saved,
        message: "Branch availability saved successfully",
      });
    } catch (error) {
      console.error("Error upserting meal branch availability:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to save meal branch availability",
      });
    }
  },

  // Delete branch availability for a meal (reset to default)
  deleteMealBranchAvailability: async (req: Request, res: Response) => {
    try {
      const { mealId, branchId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;

      const rbacUser = (req as RBACRequest).rbacUser;
      if (!rbacUser) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const orgRole = (rbacUser as any).orgRole as string | null | undefined;
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      if ((isSuperAdmin || isOrgAdmin) && !organizationId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      if (organizationId) {
        const branch = await (prisma as any).branch.findUnique({
          where: { id: branchId },
          select: { id: true, organizationId: true },
        });
        if (!branch || branch.organizationId !== organizationId) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }

        const meal = await prisma.meal.findUnique({
          where: { id: mealId },
          select: { id: true, organizationId: true },
        });
        if (!meal) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }

        const mealOrgId = (meal as any).organizationId as string | null | undefined;
        if (mealOrgId && mealOrgId !== organizationId) {
          return res.status(404).json({ success: false, message: "Meal not found" });
        }
      }

      if (!isSuperAdmin && !isOrgAdmin) {
        const allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res.status(403).json({ success: false, message: "No branch access assigned" });
        }
        if (!allowedBranchIds.includes(branchId)) {
          return res.status(403).json({ success: false, message: "You don't have access to this branch" });
        }
      }

      await (prisma as any).mealBranchAvailability.delete({
        where: {
          mealId_branchId: {
            mealId,
            branchId,
          },
        },
      });

      return res.json({
        success: true,
        message: "Branch availability deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting meal branch availability:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete meal branch availability",
      });
    }
  },
};
