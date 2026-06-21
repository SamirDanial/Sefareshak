import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { OrganizationContextRequest } from "../middleware/organizationContext";
import { RBACRequest } from "../middleware/rbac";

const prisma = new PrismaClient();

export const declarationController = {
  // Get all declarations with pagination and search
  getDeclarations: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const {
        page = "1",
        limit = "100", // Default to 100 since declarations are likely to be fewer
        search = "",
        sortBy = "createdAt",
        sortOrder = "desc",
        type = "",
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
      if (type) {
        whereClause.type = type;
      }

      const [declarations, totalCount] = await Promise.all([
        prisma.declaration.findMany({
          where: whereClause,
          skip,
          take: limitNum,
          orderBy: {
            [sortBy as string]: sortOrder as "asc" | "desc",
          },
          include: {
            _count: {
              select: {
                mealDeclarations: true,
              },
            },
          },
        }),
        prisma.declaration.count({ where: whereClause }),
      ]);

      const totalPages = Math.ceil(totalCount / limitNum);

      return res.json({
        success: true,
        data: {
          declarations,
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
      console.error("Error fetching declarations:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch declarations",
      });
    }
  },

  // Get all declarations (simplified, no pagination - for dropdowns)
  getAllDeclarations: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { type } = req.query;

      const whereClause: any = {};
      // Scope by organization if provided (backward compatible)
      if (organizationId) {
        whereClause.organizationId = organizationId;
      }
      if (type) {
        whereClause.type = type;
      }

      const declarations = await prisma.declaration.findMany({
        where: whereClause,
        orderBy: {
          name: "asc",
        },
      });

      return res.json({
        success: true,
        data: declarations,
      });
    } catch (error) {
      console.error("Error fetching all declarations:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch declarations",
      });
    }
  },

  // Get single declaration by ID
  getDeclarationById: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { id } = req.params;

      const declaration = await prisma.declaration.findUnique({
        where: { id },
        include: {
          mealDeclarations: {
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
              mealDeclarations: true,
            },
          },
        },
      });

      if (!declaration) {
        return res.status(404).json({
          success: false,
          message: "Declaration not found",
        });
      }

      // Enforce org scoping if organizationId is set
      if (organizationId && declaration.organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Declaration not found",
        });
      }

      return res.json({
        success: true,
        data: declaration,
      });
    } catch (error) {
      console.error("Error fetching declaration:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch declaration",
      });
    }
  },

  // Create new declaration
  createDeclaration: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { name, type, description, icon, shownInFilter, excludedBranches = [] } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Declaration name is required",
        });
      }

      const declaration = await prisma.declaration.create({
        data: {
          name: name.trim(),
          type: type?.trim() || null,
          description: description?.trim() || null,
          icon: icon?.trim() || null,
          shownInFilter: shownInFilter !== undefined ? shownInFilter : true,
          excludedBranches: Array.isArray(excludedBranches) ? excludedBranches : [],
          organizationId: organizationId || null,
        },
        include: {
          _count: {
            select: {
              mealDeclarations: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: declaration,
        message: "Declaration created successfully",
      });
    } catch (error) {
      console.error("Error creating declaration:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create declaration",
      });
    }
  },

  // Update declaration
  updateDeclaration: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { id } = req.params;
      const { name, type, description, icon, shownInFilter, excludedBranches } = req.body;

      // Check if declaration exists
      const existingDeclaration = await prisma.declaration.findUnique({
        where: { id },
      });

      if (!existingDeclaration) {
        return res.status(404).json({
          success: false,
          message: "Declaration not found",
        });
      }

      // Enforce org scoping
      if (organizationId && existingDeclaration.organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Declaration not found",
        });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (type !== undefined) updateData.type = type?.trim() || null;
      if (description !== undefined)
        updateData.description = description?.trim() || null;
      if (icon !== undefined) updateData.icon = icon?.trim() || null;
      if (shownInFilter !== undefined) updateData.shownInFilter = shownInFilter;
      if (excludedBranches !== undefined) {
        updateData.excludedBranches = Array.isArray(excludedBranches) ? excludedBranches : [];
      }

      const declaration = await prisma.declaration.update({
        where: { id },
        data: updateData,
        include: {
          mealDeclarations: {
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
              mealDeclarations: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: declaration,
        message: "Declaration updated successfully",
      });
    } catch (error) {
      console.error("Error updating declaration:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update declaration",
      });
    }
  },

  // Delete declaration
  deleteDeclaration: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      const { id } = req.params;

      // Check if declaration exists
      const existingDeclaration = await prisma.declaration.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              mealDeclarations: true,
            },
          },
        },
      });

      if (!existingDeclaration) {
        return res.status(404).json({
          success: false,
          message: "Declaration not found",
        });
      }

      // Enforce org scoping
      if (organizationId && existingDeclaration.organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Declaration not found",
        });
      }

      // Note: We allow deletion even if it has meals associated, as it will cascade delete the relationships
      await prisma.declaration.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: "Declaration deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting declaration:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete declaration",
      });
    }
  },

  // SUPER_ADMIN: Move declaration to a different organization
  setDeclarationOrganization: async (req: RBACRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      // Verify declaration exists
      const declaration = await prisma.declaration.findUnique({
        where: { id },
      });

      if (!declaration) {
        return res.status(404).json({
          success: false,
          message: "Declaration not found",
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

      // Get branches in target org to filter excludedBranches
      const targetOrgBranches = await prisma.branch.findMany({
        where: { organizationId },
        select: { id: true },
      });
      const targetBranchIds = new Set(targetOrgBranches.map((b) => b.id));

      // Filter excludedBranches to only include branches in target org
      const filteredExcludedBranches = (declaration.excludedBranches || []).filter(
        (branchId) => targetBranchIds.has(branchId)
      );

      // Update declaration
      const updated = await prisma.declaration.update({
        where: { id },
        data: {
          organizationId,
          excludedBranches: filteredExcludedBranches,
        },
        include: {
          _count: {
            select: {
              mealDeclarations: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: updated,
        message: "Declaration moved to organization successfully",
      });
    } catch (error) {
      console.error("Error moving declaration:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to move declaration",
      });
    }
  },

  // SUPER_ADMIN: Copy declarations to a different organization (bulk)
  copyDeclarationsToOrganization: async (req: RBACRequest, res: Response) => {
    try {
      const { ids, organizationId } = (req.body || {}) as {
        ids?: unknown;
        organizationId?: unknown;
      };

      const declarationIds = Array.isArray(ids) ? (ids as unknown[]).map(String).filter(Boolean) : [];
      const targetOrgId = typeof organizationId === "string" ? organizationId.trim() : "";

      if (declarationIds.length === 0) {
        return res.status(400).json({ success: false, message: "ids is required" });
      }
      if (!targetOrgId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      const targetOrg = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { id: true } });
      if (!targetOrg) {
        return res.status(404).json({ success: false, message: "Target organization not found" });
      }

      const targetOrgBranches = await prisma.branch.findMany({
        where: { organizationId: targetOrgId },
        select: { id: true },
      });
      const targetBranchIds = new Set(targetOrgBranches.map((b) => b.id));

      const declarations = await prisma.declaration.findMany({
        where: { id: { in: declarationIds } },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          icon: true,
          shownInFilter: true,
          excludedBranches: true,
        },
      });

      if (declarations.length !== declarationIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more declarations not found",
        });
      }

      const created = await prisma.$transaction(async (tx) => {
        const createdRows: any[] = [];
        for (const d of declarations) {
          const filteredExcludedBranches = (d.excludedBranches || []).filter((bid) => targetBranchIds.has(bid));
          const c = await tx.declaration.create({
            data: {
              organizationId: targetOrgId,
              name: d.name,
              type: d.type,
              description: d.description,
              icon: d.icon,
              shownInFilter: d.shownInFilter,
              excludedBranches: filteredExcludedBranches,
            },
            include: {
              _count: { select: { mealDeclarations: true } },
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
        message: "Declarations copied successfully",
      });
    } catch (error) {
      console.error("Error copying declarations:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to copy declarations",
      });
    }
  },
};
