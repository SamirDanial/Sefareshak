import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { OrganizationContextRequest } from "../middleware/organizationContext";
import { RBACRequest } from "../middleware/rbac";

const prisma = new PrismaClient();

export const optionalIngredientController = {
  // Get all optional ingredients with pagination and search
  getOptionalIngredients: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const {
        page = "1",
        limit = "100",
        search = "",
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const whereClause: any = {};
      // Scope by organization if provided (backward compatible: if no org, return all)
      if (organizationId) {
        whereClause.organizationId = organizationId;
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

      const [optionalIngredients, totalCount] = await Promise.all([
        prisma.optionalIngredient.findMany({
          where: whereClause,
          skip,
          take: limitNum,
          orderBy: {
            [sortBy as string]: sortOrder as "asc" | "desc",
          },
          include: {
            _count: {
              select: {
                mealOptionalIngredients: true,
              },
            },
          },
        }),
        prisma.optionalIngredient.count({ where: whereClause }),
      ]);

      const totalPages = Math.ceil(totalCount / limitNum);

      return res.json({
        success: true,
        data: {
          optionalIngredients,
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
      console.error("Error fetching optional ingredients:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch optional ingredients",
      });
    }
  },

  // Get all optional ingredients (simplified, no pagination - for dropdowns)
  getAllOptionalIngredients: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;

      const whereClause: any = {};
      // Scope by organization if provided (backward compatible)
      if (organizationId) {
        whereClause.organizationId = organizationId;
      }

      const optionalIngredients = await prisma.optionalIngredient.findMany({
        where: whereClause,
        orderBy: {
          name: "asc",
        },
      });

      return res.json({
        success: true,
        data: optionalIngredients,
      });
    } catch (error) {
      console.error("Error fetching all optional ingredients:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch optional ingredients",
      });
    }
  },

  // Get single optional ingredient by ID
  getOptionalIngredientById: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { id } = req.params;

      const optionalIngredient = await prisma.optionalIngredient.findUnique({
        where: { id },
        include: {
          mealOptionalIngredients: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: {
              mealOptionalIngredients: true,
            },
          },
        },
      });

      if (!optionalIngredient) {
        return res.status(404).json({
          success: false,
          message: "Optional ingredient not found",
        });
      }

      // Enforce org scoping if organizationId is set
      if (organizationId && optionalIngredient.organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Optional ingredient not found",
        });
      }

      return res.json({
        success: true,
        data: optionalIngredient,
      });
    } catch (error) {
      console.error("Error fetching optional ingredient:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch optional ingredient",
      });
    }
  },

  // Create new optional ingredient
  createOptionalIngredient: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { name, description } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Optional ingredient name is required",
        });
      }

      const optionalIngredient = await prisma.optionalIngredient.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          organizationId: organizationId || null,
        },
        include: {
          _count: {
            select: {
              mealOptionalIngredients: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: optionalIngredient,
        message: "Optional ingredient created successfully",
      });
    } catch (error) {
      console.error("Error creating optional ingredient:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create optional ingredient",
      });
    }
  },

  // Update optional ingredient
  updateOptionalIngredient: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { id } = req.params;
      const { name, description } = req.body;

      // Check if optional ingredient exists
      const existingOptionalIngredient =
        await prisma.optionalIngredient.findUnique({
          where: { id },
        });

      if (!existingOptionalIngredient) {
        return res.status(404).json({
          success: false,
          message: "Optional ingredient not found",
        });
      }

      // Enforce org scoping
      if (organizationId && existingOptionalIngredient.organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Optional ingredient not found",
        });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined)
        updateData.description = description?.trim() || null;

      const optionalIngredient = await prisma.optionalIngredient.update({
        where: { id },
        data: updateData,
        include: {
          mealOptionalIngredients: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: {
              mealOptionalIngredients: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: optionalIngredient,
        message: "Optional ingredient updated successfully",
      });
    } catch (error) {
      console.error("Error updating optional ingredient:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update optional ingredient",
      });
    }
  },

  // Delete optional ingredient
  deleteOptionalIngredient: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { id } = req.params;

      // Check if optional ingredient exists
      const existingOptionalIngredient =
        await prisma.optionalIngredient.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                mealOptionalIngredients: true,
              },
            },
          },
        });

      if (!existingOptionalIngredient) {
        return res.status(404).json({
          success: false,
          message: "Optional ingredient not found",
        });
      }

      // Enforce org scoping
      if (organizationId && existingOptionalIngredient.organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Optional ingredient not found",
        });
      }

      // Note: We allow deletion even if it has meals associated, as it will cascade delete the relationships
      await prisma.optionalIngredient.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: "Optional ingredient deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting optional ingredient:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete optional ingredient",
      });
    }
  },

  // SUPER_ADMIN: Move optional ingredient to a different organization
  setOptionalIngredientOrganization: async (req: RBACRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      // Verify optional ingredient exists
      const optionalIngredient = await prisma.optionalIngredient.findUnique({
        where: { id },
      });

      if (!optionalIngredient) {
        return res.status(404).json({
          success: false,
          message: "Optional ingredient not found",
        });
      }

      // Verify target organization exists
      const targetOrg = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!targetOrg) {
        return res.status(400).json({
          success: false,
          message: "Target organization not found",
        });
      }

      // Update optional ingredient
      const updated = await prisma.optionalIngredient.update({
        where: { id },
        data: {
          organizationId,
        },
        include: {
          _count: {
            select: {
              mealOptionalIngredients: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: updated,
        message: "Optional ingredient moved to organization successfully",
      });
    } catch (error) {
      console.error("Error moving optional ingredient:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to move optional ingredient",
      });
    }
  },

  // SUPER_ADMIN: Copy optional ingredients to a different organization (bulk)
  copyOptionalIngredientsToOrganization: async (req: RBACRequest, res: Response) => {
    try {
      const { ids, organizationId } = (req.body || {}) as {
        ids?: unknown;
        organizationId?: unknown;
      };

      const optionalIngredientIds = Array.isArray(ids)
        ? (ids as unknown[]).map(String).filter(Boolean)
        : [];
      const targetOrgId = typeof organizationId === "string" ? organizationId.trim() : "";

      if (optionalIngredientIds.length === 0) {
        return res.status(400).json({ success: false, message: "ids is required" });
      }
      if (!targetOrgId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      const targetOrg = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { id: true } });
      if (!targetOrg) {
        return res.status(404).json({ success: false, message: "Target organization not found" });
      }

      const rows = await prisma.optionalIngredient.findMany({
        where: { id: { in: optionalIngredientIds } },
        select: {
          id: true,
          name: true,
          description: true,
        },
      });

      if (rows.length !== optionalIngredientIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more optional ingredients not found",
        });
      }

      const created = await prisma.$transaction(async (tx) => {
        const createdRows: any[] = [];
        for (const r of rows) {
          const c = await tx.optionalIngredient.create({
            data: {
              organizationId: targetOrgId,
              name: r.name,
              description: r.description,
            },
          });
          createdRows.push(c);
        }
        return createdRows;
      });

      return res.json({
        success: true,
        data: created,
        count: created.length,
        message: "Optional ingredients copied successfully",
      });
    } catch (error) {
      console.error("Error copying optional ingredients:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to copy optional ingredients",
      });
    }
  },
};
