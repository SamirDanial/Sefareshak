import { Request, Response } from "express";
import { verifyToken } from "@clerk/clerk-sdk-node";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContextRequest } from "../middleware/organizationContext";
import DatabaseSingleton from "../config/database";

const getIssuerCandidates = (): string[] => {
  const raw = process.env.CLERK_ISSUER_URL;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const prisma = DatabaseSingleton.getInstance().getPrisma() as any;

const ensureFeaturedDealOrdering = async (organizationId: string) => {
  const featuredWithoutOrder = await prisma.deal.count({
    where: { organizationId, isFeatured: true, featuredOrder: 0 },
  });

  if (featuredWithoutOrder > 0) {
    const featuredDeals = await prisma.deal.findMany({
      where: { organizationId, isFeatured: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    await prisma.$transaction(
      featuredDeals.map((deal: { id: string }, index: number) =>
        prisma.deal.update({
          where: { id: deal.id },
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

const ensureDealListOrdering = async (organizationId: string, categoryId?: string) => {
  const whereClause: any = categoryId ? { organizationId, categoryId } : { organizationId };

  const withoutOrder = await prisma.deal.count({
    where: {
      ...whereClause,
      listOrder: 0,
    },
  });

  if (withoutOrder > 0) {
    const deals = await prisma.deal.findMany({
      where: whereClause,
      orderBy: [{ categoryId: "asc" }, { createdAt: "asc" }],
      select: { id: true, categoryId: true },
    });

    const counters = new Map<string, number>();
    await prisma.$transaction(
      deals.map((deal: { id: string; categoryId: string }, index: number) => {
        const current = counters.get(deal.categoryId) ?? 0;
        const next = current + 1;
        counters.set(deal.categoryId, next);
        return prisma.deal.update({
          where: { id: deal.id },
          data: { listOrder: next },
        });
      })
    );
  }
};

const getNextCategoryListOrder = async (
  tx: PrismaClient | any,
  organizationId: string,
  categoryId: string
) => {
  const stats = await tx.deal.aggregate({
    where: { organizationId, categoryId },
    _max: { listOrder: true },
  });

  return (stats._max.listOrder ?? 0) + 1;
};

export const dealController = {
  getDeals: async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrganizationIdForPublicMenu(req);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      await ensureFeaturedDealOrdering(organizationId);
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

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const whereClause: any = { organizationId };

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
              deals: [],
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

      if (branchId) {
        whereClause.NOT = {
          OR: [
            {
              excludedBranches: {
                has: branchId as string,
              },
            },
            {
              category: {
                excludedBranches: {
                  has: branchId as string,
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

      let orderByClause: any;

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

      const [deals, totalCount] = await Promise.all([
        prisma.deal.findMany({
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
            components: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include:
                branchId && typeof branchId === "string"
                  ? {
                      branchPrices: {
                        where: { branchId: branchId as string },
                        select: {
                          id: true,
                          branchId: true,
                          price: true,
                          taxPercentage: true,
                        },
                      },
                    }
                  : undefined,
            },
            dealAddOns: {
              include: {
                addOn: {
                  include: {
                    addonSizes: true,
                    addonBranchPrices:
                      branchId && typeof branchId === "string"
                        ? {
                            where: { branchId: branchId as string },
                            select: {
                              id: true,
                              branchId: true,
                              basePrice: true,
                              taxPercentage: true,
                            },
                          }
                        : false,
                  },
                },
              },
            },
            dealDeclarations: {
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
            dealOptionalIngredients: {
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
        }),
        prisma.deal.count({ where: whereClause }),
      ]);

      const dealsWithEffective = deals.map((deal: any) => {
        const dealData: any = { ...deal };

        if (
          branchId &&
          typeof branchId === "string" &&
          Array.isArray(dealData.components)
        ) {
          dealData.components = dealData.components.map((c: any) => {
            const row: any = { ...c };
            const override =
              Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                ? c.branchPrices[0]
                : null;

            row.effectivePrice = override ? Number(override.price) : Number(c.price);
            row.effectiveTaxPercentage =
              override && override.taxPercentage !== null && override.taxPercentage !== undefined
                ? Number(override.taxPercentage)
                : Number(c.taxPercentage);

            if (row.branchPrices) delete row.branchPrices;
            return row;
          });
        }

        return dealData;
      });

      const totalPages = Math.ceil(totalCount / limitNum);

      return res.json({
        success: true,
        data: {
          deals: dealsWithEffective,
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
      console.error("Error fetching deals:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch deals",
      });
    }
  },

  reorderCategoryDeals: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { categoryId, deals } = req.body as {
        categoryId?: string;
        deals: { id: string; order?: number }[];
      };

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: "Category id is required.",
        });
      }

      if (!Array.isArray(deals) || deals.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Deal order payload is required.",
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
      for (const deal of deals) {
        if (!deal.id || typeof deal.id !== "string") {
          return res.status(400).json({
            success: false,
            message: "Each deal must include a valid id.",
          });
        }
        if (seenIds.has(deal.id)) {
          return res.status(400).json({
            success: false,
            message: "Duplicate deal ids are not allowed.",
          });
        }
        seenIds.add(deal.id);
      }

      await ensureDealListOrdering(organizationId, categoryId);

      const categoryDeals = await prisma.deal.findMany({
        where: { id: { in: deals.map((d) => d.id) }, organizationId },
        select: { id: true, categoryId: true },
      });

      if (categoryDeals.length !== deals.length) {
        return res.status(400).json({
          success: false,
          message: "One or more deals do not exist.",
        });
      }

      const invalidDeal = categoryDeals.find((deal: any) => deal.categoryId !== categoryId);
      if (invalidDeal) {
        return res.status(400).json({
          success: false,
          message: "All deals must belong to the specified category.",
        });
      }

      const remainingDeals = await prisma.deal.findMany({
        where: {
          categoryId,
          organizationId,
          id: { notIn: deals.map((d) => d.id) },
        },
        select: { id: true },
        orderBy: { listOrder: "asc" },
      });

      let currentOrder = 0;
      const updates: any[] = [];

      for (const deal of deals) {
        currentOrder += 1;
        const orderValue =
          deal.order && Number.isFinite(deal.order) ? Number(deal.order) : currentOrder;
        updates.push(
          prisma.deal.update({
            where: { id: deal.id },
            data: { listOrder: orderValue },
          })
        );
        currentOrder = orderValue;
      }

      for (const deal of remainingDeals) {
        currentOrder += 1;
        updates.push(
          prisma.deal.update({
            where: { id: deal.id },
            data: { listOrder: currentOrder },
          })
        );
      }

      await prisma.$transaction(updates);

      return res.json({
        success: true,
        message: "Category deals reordered successfully",
      });
    } catch (error) {
      console.error("Error reordering category deals:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reorder category deals",
      });
    }
  },

  getDealById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { branchId } = req.query;

      const organizationId = await resolveOrganizationIdForPublicMenu(req);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const deal = await prisma.deal.findUnique({
        where: { id },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              excludedBranches: branchId && typeof branchId === "string" ? true : false,
            },
          },
          components: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include:
              branchId && typeof branchId === "string"
                ? {
                    branchPrices: {
                      where: { branchId: branchId as string },
                      select: {
                        id: true,
                        branchId: true,
                        price: true,
                        taxPercentage: true,
                      },
                    },
                  }
                : undefined,
          },
          dealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                  addonBranchPrices:
                    branchId && typeof branchId === "string"
                      ? {
                          where: { branchId: branchId as string },
                          select: {
                            id: true,
                            branchId: true,
                            basePrice: true,
                            taxPercentage: true,
                          },
                        }
                      : false,
                },
              },
            },
          },
          dealDeclarations: {
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
          dealOptionalIngredients: {
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

      if (!deal || (deal as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Deal not found",
        });
      }

      if (branchId && typeof branchId === "string") {
        const excluded =
          (Array.isArray((deal as any).excludedBranches) && (deal as any).excludedBranches.includes(branchId)) ||
          (Array.isArray((deal as any)?.category?.excludedBranches) &&
            (deal as any).category.excludedBranches.includes(branchId));

        if (excluded) {
          return res.status(404).json({
            success: false,
            message: "Deal not found",
          });
        }
      }

      const dealData: any = { ...deal };
      if (branchId && typeof branchId === "string" && Array.isArray(dealData.components)) {
        dealData.components = dealData.components.map((c: any) => {
          const row: any = { ...c };
          const override =
            Array.isArray(c.branchPrices) && c.branchPrices.length > 0
              ? c.branchPrices[0]
              : null;
          row.effectivePrice = override ? Number(override.price) : Number(c.price);
          row.effectiveTaxPercentage =
            override && override.taxPercentage !== null && override.taxPercentage !== undefined
              ? Number(override.taxPercentage)
              : Number(c.taxPercentage);
          if (row.branchPrices) delete row.branchPrices;
          return row;
        });
      }

      return res.json({
        success: true,
        data: dealData,
      });
    } catch (error) {
      console.error("Error fetching deal:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch deal",
      });
    }
  },

  createDeal: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
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
        image,
        categoryId,
        excludedBranches = [],
        isActive = true,
        isFeatured = false,
        components = [],
        addOnIds = [],
        declarationIds = [],
        optionalIngredientIds = [],
      } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Deal name is required",
        });
      }

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: "Category is required",
        });
      }

      if (!Array.isArray(components) || components.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Deal components are required",
        });
      }

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

      const trimmedSku = sku ? String(sku).trim() : null;
      if (trimmedSku) {
        const existingDealWithSku = await (prisma as any).deal.findFirst({
          where: { organizationId, sku: trimmedSku },
        });
        if (existingDealWithSku) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
        const existingMealWithSku = await (prisma as any).meal.findFirst({
          where: { organizationId, sku: trimmedSku },
        });
        if (existingMealWithSku) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
      }

      const result = await prisma.$transaction(async (tx: any) => {
        let nextFeaturedOrder = 0;
        if (Boolean(isFeatured)) {
          const featuredStats = await tx.deal.aggregate({
            where: { organizationId, isFeatured: true },
            _max: { featuredOrder: true },
          });
          nextFeaturedOrder = (featuredStats._max.featuredOrder ?? 0) + 1;
        }

        const nextListOrder = await getNextCategoryListOrder(tx, organizationId, categoryId);

        const deal = await tx.deal.create({
          data: {
            organizationId,
            name: name.trim(),
            description: description?.trim() || null,
            sku: trimmedSku,
            image: image?.trim() || null,
            categoryId,
            excludedBranches: excludedBranchIds,
            isActive: Boolean(isActive),
            isFeatured: Boolean(isFeatured),
            featuredOrder: Boolean(isFeatured) ? nextFeaturedOrder : 0,
            listOrder: nextListOrder,
          } as any,
        });

        await tx.dealComponent.createMany({
          data: components.map((c: any, idx: number) => ({
            dealId: deal.id,
            name: String(c.name || "").trim(),
            price: parseFloat(c.price),
            taxPercentage: parseFloat(c.taxPercentage),
            quantity:
              c.quantity !== undefined && c.quantity !== null
                ? Math.max(1, Number(c.quantity) || 1)
                : 1,
            sortOrder:
              c.sortOrder !== undefined && c.sortOrder !== null
                ? Number(c.sortOrder)
                : idx,
          })),
        });

        if (Array.isArray(addOnIds) && addOnIds.length > 0) {
          await tx.dealAddOn.createMany({
            data: addOnIds.map((addOnId: string) => ({
              dealId: deal.id,
              addOnId,
            })),
          });
        }

        if (Array.isArray(declarationIds) && declarationIds.length > 0) {
          await tx.dealDeclaration.createMany({
            data: declarationIds.map((declarationId: string) => ({
              dealId: deal.id,
              declarationId,
            })),
          });
        }

        if (Array.isArray(optionalIngredientIds) && optionalIngredientIds.length > 0) {
          await tx.dealOptionalIngredient.createMany({
            data: optionalIngredientIds.map((optionalIngredientId: string) => ({
              dealId: deal.id,
              optionalIngredientId,
            })),
          });
        }

        return deal;
      });

      const completeDeal = await prisma.deal.findUnique({
        where: { id: result.id },
        include: {
          category: { select: { id: true, name: true } },
          components: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          dealAddOns: { include: { addOn: { include: { addonSizes: true } } } },
          dealDeclarations: {
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
          dealOptionalIngredients: {
            include: {
              optionalIngredient: {
                select: { id: true, name: true, description: true },
              },
            },
          },
          _count: { select: { orderItems: true } },
        },
      });

      return res.status(201).json({
        success: true,
        data: completeDeal,
        message: "Deal created successfully",
      });
    } catch (error) {
      console.error("Error creating deal:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create deal",
      });
    }
  },

  updateDeal: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
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
        image,
        categoryId,
        excludedBranches,
        isActive,
        isFeatured,
        components,
        addOnIds,
        declarationIds,
        optionalIngredientIds,
      } = req.body;

      const existingDeal = await prisma.deal.findUnique({ where: { id } });
      if (!existingDeal || (existingDeal as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Deal not found",
        });
      }

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

      const trimmedSkuUpdate = sku !== undefined ? (sku ? String(sku).trim() : null) : undefined;
      if (trimmedSkuUpdate) {
        const existingDealWithSku = await prisma.deal.findFirst({
          where: { organizationId, sku: trimmedSkuUpdate, id: { not: id } },
        });
        if (existingDealWithSku) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
        const existingMealWithSku = await prisma.meal.findFirst({
          where: { organizationId, sku: trimmedSkuUpdate },
        });
        if (existingMealWithSku) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
      }

      const result = await prisma.$transaction(async (tx: any) => {
        const updateData: any = {};
        if (name !== undefined) updateData.name = String(name).trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (trimmedSkuUpdate !== undefined) updateData.sku = trimmedSkuUpdate;
        if (image !== undefined) updateData.image = image?.trim() || null;
        if (excludedBranches !== undefined) {
          updateData.excludedBranches = Array.isArray(excludedBranches)
            ? excludedBranches.filter((v: any) => typeof v === "string" && v.trim().length > 0)
            : [];
        }
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);

        if (categoryId !== undefined && categoryId !== existingDeal.categoryId) {
          updateData.categoryId = categoryId;
          updateData.listOrder = await getNextCategoryListOrder(tx, organizationId, categoryId);
        } else if (categoryId !== undefined) {
          updateData.categoryId = categoryId;
        }

        if (isFeatured !== undefined) {
          const nextState = Boolean(isFeatured);
          if (nextState && !existingDeal.isFeatured) {
            const featuredStats = await tx.deal.aggregate({
              where: { organizationId, isFeatured: true },
              _max: { featuredOrder: true },
            });
            updateData.featuredOrder = (featuredStats._max.featuredOrder ?? 0) + 1;
            updateData.isFeatured = true;
          } else if (!nextState && existingDeal.isFeatured) {
            updateData.isFeatured = false;
            updateData.featuredOrder = 0;
          } else {
            updateData.isFeatured = nextState;
          }
        }

        const deal = await tx.deal.update({
          where: { id },
          data: updateData,
        });

        if (components !== undefined) {
          await tx.dealComponentBranchPrice.deleteMany({
            where: { dealComponent: { dealId: id } },
          });
          await tx.dealComponent.deleteMany({ where: { dealId: id } });

          if (!Array.isArray(components) || components.length === 0) {
            throw new Error("Deal components are required");
          }

          await tx.dealComponent.createMany({
            data: components.map((c: any, idx: number) => ({
              dealId: id,
              name: String(c.name || "").trim(),
              price: parseFloat(c.price),
              taxPercentage: parseFloat(c.taxPercentage),
              quantity:
                c.quantity !== undefined && c.quantity !== null
                  ? Math.max(1, Number(c.quantity) || 1)
                  : 1,
              sortOrder:
                c.sortOrder !== undefined && c.sortOrder !== null
                  ? Number(c.sortOrder)
                  : idx,
            })),
          });
        }

        if (addOnIds !== undefined) {
          await tx.dealAddOn.deleteMany({ where: { dealId: id } });
          if (Array.isArray(addOnIds) && addOnIds.length > 0) {
            await tx.dealAddOn.createMany({
              data: addOnIds.map((addOnId: string) => ({ dealId: id, addOnId })),
            });
          }
        }

        if (declarationIds !== undefined) {
          await tx.dealDeclaration.deleteMany({ where: { dealId: id } });
          if (Array.isArray(declarationIds) && declarationIds.length > 0) {
            await tx.dealDeclaration.createMany({
              data: declarationIds.map((declarationId: string) => ({
                dealId: id,
                declarationId,
              })),
            });
          }
        }

        if (optionalIngredientIds !== undefined) {
          await tx.dealOptionalIngredient.deleteMany({ where: { dealId: id } });
          if (Array.isArray(optionalIngredientIds) && optionalIngredientIds.length > 0) {
            await tx.dealOptionalIngredient.createMany({
              data: optionalIngredientIds.map((optionalIngredientId: string) => ({
                dealId: id,
                optionalIngredientId,
              })),
            });
          }
        }

        return deal;
      });

      const completeDeal = await prisma.deal.findUnique({
        where: { id: result.id },
        include: {
          category: { select: { id: true, name: true } },
          components: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          dealAddOns: { include: { addOn: { include: { addonSizes: true } } } },
          dealDeclarations: {
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
          dealOptionalIngredients: {
            include: {
              optionalIngredient: {
                select: { id: true, name: true, description: true },
              },
            },
          },
          _count: { select: { orderItems: true } },
        },
      });

      return res.json({
        success: true,
        data: completeDeal,
        message: "Deal updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating deal:", error);
      return res.status(500).json({
        success: false,
        message: error?.message === "Deal components are required" ? error.message : "Failed to update deal",
      });
    }
  },

  deleteDeal: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      const existingDeal = await prisma.deal.findUnique({
        where: { id },
        include: {
          _count: { select: { orderItems: true } },
        },
      });

      if (!existingDeal || (existingDeal as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Deal not found",
        });
      }

      if (existingDeal._count.orderItems > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete deal. It has ${existingDeal._count.orderItems} order(s) associated with it.`,
        });
      }

      await prisma.deal.delete({ where: { id } });

      return res.json({
        success: true,
        message: "Deal deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting deal:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete deal",
      });
    }
  },

  toggleDealStatus: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      const deal = await prisma.deal.findUnique({ where: { id } });
      if (!deal || (deal as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Deal not found",
        });
      }

      const updatedDeal = await prisma.deal.update({
        where: { id },
        data: { isActive: !deal.isActive },
        include: {
          category: { select: { id: true, name: true } },
          components: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          _count: { select: { orderItems: true } },
        },
      });

      return res.json({
        success: true,
        data: updatedDeal,
        message: `Deal ${updatedDeal.isActive ? "activated" : "deactivated"} successfully`,
      });
    } catch (error) {
      console.error("Error toggling deal status:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to toggle deal status",
      });
    }
  },
};
