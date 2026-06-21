import { Request, Response } from "express";
import type { OrganizationContextRequest } from "../middleware/organizationContext";
import DatabaseSingleton from "../config/database";

const prisma = DatabaseSingleton.getInstance().getPrisma();

const ensureCategoryOrdering = async (organizationId: string) => {
  const categoriesWithoutListOrder = await prisma.category.count({
    where: { organizationId, listOrder: 0 },
  });

  if (categoriesWithoutListOrder > 0) {
    const categories = await prisma.category.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    await prisma.$transaction(
      categories.map((category, index) =>
        prisma.category.update({
          where: { id: category.id },
          data: { listOrder: index + 1 },
        })
      )
    );
  }

  const featuredWithoutOrder = await prisma.category.count({
    where: { organizationId, isFeatured: true, featuredOrder: 0 },
  });

  if (featuredWithoutOrder > 0) {
    const featured = await prisma.category.findMany({
      where: { organizationId, isFeatured: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    await prisma.$transaction(
      featured.map((category, index) =>
        prisma.category.update({
          where: { id: category.id },
          data: { featuredOrder: index + 1 },
        })
      )
    );
  }
};

export const categoryController = {
  // Get all categories with pagination and search
  getCategories: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      await ensureCategoryOrdering(organizationId);
      const {
        page = "1",
        limit = "10",
        search = "",
        sortBy = "listOrder",
        sortOrder = "asc",
        status = "",
        excludeDealCategories = "false",
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
      // Only filter by status if explicitly provided
      // This allows admin to see both active and inactive categories by default
      if (status === "ACTIVE") whereClause.isActive = true;
      else if (status === "INACTIVE") whereClause.isActive = false;

      if (excludeDealCategories === "true") {
        whereClause.deals = {
          none: {},
        };
      }

      const sortableFields = new Set([
        "name",
        "createdAt",
        "updatedAt",
        "listOrder",
        "featuredOrder",
      ]);

      const resolvedSortBy = sortableFields.has(sortBy as string)
        ? (sortBy as string)
        : "listOrder";

      const resolvedSortOrder =
        sortOrder === "desc" || sortOrder === "asc" ? sortOrder : "asc";

      const orderBy: any = [{ [resolvedSortBy]: resolvedSortOrder }];
      // Secondary sort to ensure stable ordering
      if (resolvedSortBy !== "name") {
        orderBy.push({ name: "asc" });
      }

      const [categories, totalCount] = await Promise.all([
        prisma.category.findMany({
          where: whereClause,
          skip,
          take: limitNum,
          orderBy,
          include: {
            _count: {
              select: {
                meals: true,
                deals: true,
              },
            },
          },
        }),
        prisma.category.count({ where: whereClause }),
      ]);

      const totalPages = Math.ceil(totalCount / limitNum);

      return res.json({
        success: true,
        data: {
          categories,
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
      console.error("Error fetching categories:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch categories",
      });
    }
  },

  // Get single category by ID
  getCategoryById: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          meals: {
            select: {
              id: true,
              name: true,
              basePrice: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              meals: true,
              deals: true,
            },
          },
        },
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      if ((category as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      return res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      console.error("Error fetching category:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch category",
      });
    }
  },

  // Create new category
  createCategory: async (req: OrganizationContextRequest, res: Response) => {
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
        taxPercentage,
        image,
        excludedBranches = [],
        isActive = true,
        isFeatured = false,
      } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
      }

      const excludedBranchIds: string[] = Array.isArray(excludedBranches)
        ? excludedBranches.filter((v: any) => typeof v === "string" && v.trim().length > 0)
        : [];

      if (excludedBranchIds.length > 0) {
        const count = await prisma.branch.count({
          where: {
            id: { in: excludedBranchIds },
            organizationId,
          },
        });

        if (count !== excludedBranchIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more excludedBranches do not belong to this organization",
          });
        }
      }

      // Check if category name already exists
      const existingCategory = await prisma.category.findFirst({
        where: { name: name.trim(), organizationId },
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists",
        });
      }

      const orderStats = await prisma.category.aggregate({
        _max: { listOrder: true, featuredOrder: true },
        where: { organizationId },
      });

      const nextListOrder = (orderStats._max.listOrder ?? 0) + 1;
      const nextFeaturedOrder = (orderStats._max.featuredOrder ?? 0) + 1;

      const category = await prisma.category.create({
        data: {
          organizationId,
          name: name.trim(),
          description: description?.trim() || null,
          taxPercentage:
            taxPercentage !== undefined ? parseFloat(taxPercentage) : null,
          image: image?.trim() || null,
          excludedBranches: excludedBranchIds,
          isActive: Boolean(isActive),
          isFeatured: Boolean(isFeatured),
          listOrder: nextListOrder,
          featuredOrder: Boolean(isFeatured) ? nextFeaturedOrder : 0,
        },
        include: {
          _count: {
            select: {
              meals: true,
              deals: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: category,
        message: "Category created successfully",
      });
    } catch (error) {
      console.error("Error creating category:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create category",
      });
    }
  },

  // Update category
  updateCategory: async (req: OrganizationContextRequest, res: Response) => {
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
        taxPercentage,
        image,
        excludedBranches,
        isActive,
        isFeatured,
      } = req.body;

      // Check if category exists
      const existingCategory = await prisma.category.findUnique({
        where: { id },
      });

      if (!existingCategory || (existingCategory as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // Check if new name conflicts with existing category
      if (name && name.trim() !== existingCategory.name) {
        const nameConflict = await prisma.category.findFirst({
          where: { name: name.trim(), organizationId },
        });

        if (nameConflict) {
          return res.status(400).json({
            success: false,
            message: "Category with this name already exists",
          });
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined)
        updateData.description = description?.trim() || null;
      if (taxPercentage !== undefined)
        updateData.taxPercentage =
          taxPercentage !== null ? parseFloat(taxPercentage) : null;
      if (image !== undefined) updateData.image = image?.trim() || null;
      if (excludedBranches !== undefined) {
        const excludedBranchIds: string[] = Array.isArray(excludedBranches)
          ? excludedBranches.filter((v: any) => typeof v === "string" && v.trim().length > 0)
          : [];

        if (excludedBranchIds.length > 0) {
          const count = await prisma.branch.count({
            where: {
              id: { in: excludedBranchIds },
              organizationId,
            },
          });

          if (count !== excludedBranchIds.length) {
            return res.status(400).json({
              success: false,
              message: "One or more excludedBranches do not belong to this organization",
            });
          }
        }

        updateData.excludedBranches = excludedBranchIds;
      }
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);
      if (isFeatured !== undefined) {
        if (Boolean(isFeatured) && !existingCategory.isFeatured) {
          const nextFeaturedOrderData = await prisma.category.aggregate({
            _max: { featuredOrder: true },
          });
          updateData.featuredOrder =
            (nextFeaturedOrderData._max.featuredOrder ?? 0) + 1;
          updateData.isFeatured = true;
        } else if (!Boolean(isFeatured) && existingCategory.isFeatured) {
          updateData.isFeatured = false;
          updateData.featuredOrder = 0;
        } else {
          updateData.isFeatured = Boolean(isFeatured);
        }
      }

      const category = await prisma.category.update({
        where: { id },
        data: updateData,
        include: {
          meals: {
            select: {
              id: true,
              name: true,
              basePrice: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              meals: true,
              deals: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: category,
        message: "Category updated successfully",
      });
    } catch (error) {
      console.error("Error updating category:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update category",
      });
    }
  },

  // Delete category
  deleteCategory: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      // Check if category exists
      const existingCategory = await prisma.category.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              meals: true,
            },
          },
        },
      });

      if (!existingCategory || (existingCategory as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // Check if category has meals
      if (existingCategory._count.meals > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete category. It has ${existingCategory._count.meals} meal(s) associated with it.`,
        });
      }

      await prisma.category.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting category:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete category",
      });
    }
  },

  // Toggle category status
  toggleCategoryStatus: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      const category = await prisma.category.findUnique({
        where: { id },
      });

      if (!category || (category as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      const updatedCategory = await prisma.category.update({
        where: { id },
        data: {
          isActive: !category.isActive,
        },
        include: {
          _count: {
            select: {
              meals: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: updatedCategory,
        message: `Category ${
          updatedCategory.isActive ? "activated" : "deactivated"
        } successfully`,
      });
    } catch (error) {
      console.error("Error toggling category status:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to toggle category status",
      });
    }
  },

  reorderCategories: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { type, categories } = req.body as {
        type: "featured" | "list";
        categories: { id: string; order?: number }[];
      };

      if (!type || !["featured", "list"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid reorder type. Use 'featured' or 'list'.",
        });
      }

      if (!Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Category order payload is required.",
        });
      }

      const seenIds = new Set<string>();
      for (const item of categories) {
        if (!item.id || typeof item.id !== "string") {
          return res.status(400).json({
            success: false,
            message: "Each category must include a valid id.",
          });
        }
        if (seenIds.has(item.id)) {
          return res.status(400).json({
            success: false,
            message: "Duplicate category ids are not allowed.",
          });
        }
        seenIds.add(item.id);
      }

      // Ensure list ordering exists before reordering
      await ensureCategoryOrdering(organizationId);

      const dbCategories = await prisma.category.findMany({
        where: { id: { in: categories.map((c) => c.id) } },
        select: { id: true, organizationId: true },
      });

      if (dbCategories.length !== categories.length) {
        return res.status(404).json({
          success: false,
          message: "One or more categories not found",
        });
      }

      if (dbCategories.some((c) => (c as any).organizationId !== organizationId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      await prisma.$transaction(
        categories.map((category, index) => {
          const orderValue =
            category.order && Number.isFinite(category.order)
              ? Number(category.order)
              : index + 1;
          return prisma.category.update({
            where: { id: category.id },
            data:
              type === "featured"
                ? { featuredOrder: orderValue }
                : { listOrder: orderValue },
          });
        })
      );

      return res.json({
        success: true,
        message:
          type === "featured"
            ? "Featured categories reordered successfully"
            : "Categories reordered successfully",
      });
    } catch (error) {
      console.error("Error reordering categories:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reorder categories",
      });
    }
  },

  setCategoryOrganization: async (req: Request, res: Response) => {
    try {
      const categoryId = req.params.id;
      const { organizationId } = (req.body || {}) as { organizationId?: string | null };

      if (!categoryId || typeof categoryId !== "string") {
        return res.status(400).json({ success: false, message: "categoryId is required" });
      }

      if (organizationId !== null && organizationId !== undefined) {
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!org) {
          return res.status(404).json({
            success: false,
            message: "Organization not found",
          });
        }
      }

      const existing = await prisma.category.findUnique({
        where: { id: categoryId },
        select: {
          id: true,
          name: true,
          organizationId: true,
        },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: "Category not found" });
      }

      const nextOrgId = organizationId ?? null;
      if (String(existing.organizationId || "") === String(nextOrgId || "")) {
        const category = await prisma.category.findUnique({ where: { id: categoryId } });
        return res.json({ success: true, data: category });
      }

      if (nextOrgId) {
        const conflict = await prisma.category.findFirst({
          where: {
            organizationId: nextOrgId,
            name: existing.name,
            NOT: { id: categoryId },
          },
          select: { id: true },
        });
        if (conflict) {
          return res.status(400).json({
            success: false,
            message: "Category with this name already exists in the target organization",
          });
        }
      }

      const allowedBranchIds = nextOrgId
        ? (
            await prisma.branch.findMany({
              where: { organizationId: nextOrgId },
              select: { id: true },
            })
          ).map((b) => b.id)
        : [];
      const allowedBranchSet = new Set(allowedBranchIds);
      const filterExcluded = (arr: any): string[] => {
        if (!Array.isArray(arr)) return [];
        if (!nextOrgId) return [];
        return arr.filter((v) => typeof v === "string" && allowedBranchSet.has(v));
      };

      const result = await prisma.$transaction(async (tx) => {
        const categoryWithRelations = await tx.category.findUnique({
          where: { id: categoryId },
          select: {
            id: true,
            excludedBranches: true,
            meals: { select: { id: true, excludedBranches: true } },
            deals: { select: { id: true, excludedBranches: true } },
            addonCategories: {
              select: {
                id: true,
                addonId: true,
              },
            },
          },
        });

        if (!categoryWithRelations) {
          throw new Error("Category not found");
        }

        const updatedCategory = await tx.category.update({
          where: { id: categoryId },
          data: {
            organizationId: nextOrgId,
            excludedBranches: filterExcluded(categoryWithRelations.excludedBranches),
          },
        });

        const updates: Promise<any>[] = [];

        for (const m of categoryWithRelations.meals) {
          updates.push(
            tx.meal.update({
              where: { id: m.id },
              data: {
                organizationId: nextOrgId,
                excludedBranches: filterExcluded(m.excludedBranches),
              },
            })
          );
        }

        for (const d of categoryWithRelations.deals) {
          updates.push(
            tx.deal.update({
              where: { id: d.id },
              data: {
                organizationId: nextOrgId,
                excludedBranches: filterExcluded(d.excludedBranches),
              },
            })
          );
        }

        if (updates.length > 0) {
          await Promise.all(updates);
        }

        if (!nextOrgId) {
          await tx.addonCategory.deleteMany({ where: { categoryId } });
        } else {
          const links = categoryWithRelations.addonCategories;
          if (links.length > 0) {
            const addons = await tx.addOn.findMany({
              where: { id: { in: links.map((l) => l.addonId) } },
              select: { id: true, organizationId: true },
            });
            const addonOrg = new Map(addons.map((a) => [a.id, a.organizationId]));
            const deleteIds = links
              .filter((l) => String(addonOrg.get(l.addonId) || "") !== String(nextOrgId))
              .map((l) => l.id);
            if (deleteIds.length > 0) {
              await tx.addonCategory.deleteMany({ where: { id: { in: deleteIds } } });
            }
          }
        }

        return updatedCategory;
      });

      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error updating category organization:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update category organization",
      });
    }
  },

  // SUPER_ADMIN: Copy categories to a different organization (bulk)
  copyCategoriesToOrganization: async (req: Request, res: Response) => {
    try {
      const { ids, organizationId } = (req.body || {}) as {
        ids?: unknown;
        organizationId?: unknown;
      };

      const categoryIds = Array.isArray(ids) ? (ids as unknown[]).map(String).filter(Boolean) : [];
      const targetOrgId = typeof organizationId === "string" ? organizationId.trim() : "";

      if (categoryIds.length === 0) {
        return res.status(400).json({ success: false, message: "ids is required" });
      }

      if (!targetOrgId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      const org = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { id: true } });
      if (!org) {
        return res.status(404).json({ success: false, message: "Organization not found" });
      }

      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: {
          id: true,
          name: true,
          description: true,
          taxPercentage: true,
          image: true,
          isActive: true,
          isFeatured: true,
          excludedBranches: true,
        },
      });

      if (categories.length !== categoryIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more categories not found",
        });
      }

      const existingInTarget = await prisma.category.findMany({
        where: {
          organizationId: targetOrgId,
          name: { in: categories.map((c) => c.name) },
        },
        select: { name: true },
      });
      if (existingInTarget.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Some categories already exist in the target organization",
          conflicts: existingInTarget.map((c) => c.name),
        });
      }

      const allowedBranchIds = (
        await prisma.branch.findMany({
          where: { organizationId: targetOrgId },
          select: { id: true },
        })
      ).map((b) => b.id);
      const allowedBranchSet = new Set(allowedBranchIds);
      const filterExcluded = (arr: any): string[] => {
        if (!Array.isArray(arr)) return [];
        return arr.filter((v) => typeof v === "string" && allowedBranchSet.has(v));
      };

      const created = await prisma.$transaction(async (tx) => {
        const createdRows = [] as any[];
        for (const c of categories) {
          const row = await tx.category.create({
            data: {
              organizationId: targetOrgId,
              name: c.name,
              description: c.description,
              taxPercentage: c.taxPercentage,
              image: c.image,
              isActive: c.isActive,
              isFeatured: c.isFeatured,
              featuredOrder: 0,
              listOrder: 0,
              excludedBranches: filterExcluded(c.excludedBranches),
            },
          });
          createdRows.push(row);
        }
        return createdRows;
      });

      return res.json({
        success: true,
        data: created,
        count: created.length,
        message: "Categories copied successfully",
      });
    } catch (error) {
      console.error("Error copying categories:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to copy categories",
      });
    }
  },
};
