import { Request, Response } from "express";
import DatabaseSingleton from "../config/database";
import { type RBACRequest } from "../middleware/rbac";
import type { OrganizationContextRequest } from "../middleware/organizationContext";
import { hasImplicitFullAccess } from "../config/permissions";
import { getAddonPriceAndTax } from "../utils/addonPriceHelper";

const prisma = DatabaseSingleton.getInstance().getPrisma();

export const addonController = {
  // Get all addons with pagination and search
  getAddons: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const {
        page = "1",
        limit = "10",
        search = "",
        sortBy = "createdAt",
        sortOrder = "desc",
        status = "",
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
            nameFa: {
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
          {
            descriptionFa: {
              contains: search as string,
              mode: "insensitive" as const,
            },
          },
        ];
      }

      if (status === "ACTIVE") {
        whereClause.isActive = true;
      } else if (status === "INACTIVE") {
        whereClause.isActive = false;
      }

      const { branchId } = req.query;

      const [addons, totalCount] = await Promise.all([
        prisma.addOn.findMany({
          where: whereClause,
          skip,
          take: limitNum,
          orderBy: {
            [sortBy as string]: sortOrder as "asc" | "desc",
          },
          include: {
            addonCategories: {
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            addonSizes: true,
            addonBranchPrices: branchId && typeof branchId === "string" 
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
            _count: {
              select: {
                mealAddOns: true,
              },
            },
          },
        }),
        prisma.addOn.count({ where: whereClause }),
      ]);

      // Calculate effective prices if branchId is provided
      const addonsWithEffectivePrices = await Promise.all(
        addons.map(async (addon: any) => {
          if (branchId && typeof branchId === "string") {
            const { basePrice, taxPercentage } = await getAddonPriceAndTax(
              addon.id,
              branchId
            );
            return {
              ...addon,
              effectiveBasePrice: basePrice,
              effectiveTaxPercentage: taxPercentage,
              // Remove addonBranchPrices from response (we've already extracted the needed info)
              addonBranchPrices: undefined,
            };
          }
          return {
            ...addon,
            effectiveBasePrice: addon.price !== null ? Number(addon.price) : 0,
            effectiveTaxPercentage: addon.taxPercentage !== null ? Number(addon.taxPercentage) : null,
          };
        })
      );

      const totalPages = Math.ceil(totalCount / limitNum);

      return res.json({
        success: true,
        data: {
          addons: addonsWithEffectivePrices,
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
      console.error("Error fetching addons:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch addons",
      });
    }
  },

  // Get single addon by ID
  getAddonById: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;
      const { branchId } = req.query;

      const addon = await prisma.addOn.findUnique({
        where: { id },
        include: {
          addonCategories: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          addonSizes: true,
          addonBranchPrices: branchId && typeof branchId === "string" 
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
          mealAddOns: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: {
              mealAddOns: true,
            },
          },
        },
      });

      if (!addon) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      if ((addon as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      // Calculate effective price if branchId is provided
      const addonData: any = { ...addon };
      if (branchId && typeof branchId === "string") {
        const { basePrice, taxPercentage } = await getAddonPriceAndTax(
          addon.id,
          branchId
        );
        addonData.effectiveBasePrice = basePrice;
        addonData.effectiveTaxPercentage = taxPercentage;
        
        // Remove addonBranchPrices from response (we've already extracted the needed info)
        if (addonData.addonBranchPrices) {
          delete addonData.addonBranchPrices;
        }
      } else {
        addonData.effectiveBasePrice = addon.price !== null ? Number(addon.price) : 0;
        addonData.effectiveTaxPercentage = addon.taxPercentage !== null ? Number(addon.taxPercentage) : null;
      }

      return res.json({
        success: true,
        data: addonData,
      });
    } catch (error) {
      console.error("Error fetching addon:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch addon",
      });
    }
  },

  // Create new addon
  createAddon: async (req: OrganizationContextRequest, res: Response) => {
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
        nameFa,
        description,
        descriptionFa,
        sku,
        price, // Base price
        sizes = [],
        taxPercentage,
        image,
        type,
        excludedBranches = [],
        isActive = true,
        categoryIds,
      } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Addon name is required",
        });
      }

      if (!price || price < 0) {
        return res.status(400).json({
          success: false,
          message: "Base price is required and must be non-negative",
        });
      }

      if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one addon size is required",
        });
      }

      // Validate sizes
      for (const size of sizes) {
        if (!size.sizeType || !["S", "M", "L", "XL"].includes(size.sizeType)) {
          return res.status(400).json({
            success: false,
            message: "Each size must have a valid sizeType (S, M, L, XL)",
          });
        }
        if (size.price === undefined || size.price < 0) {
          return res.status(400).json({
            success: false,
            message: "Each size must have a non-negative additional price",
          });
        }
      }

      if (!type || !["BOOLEAN", "QUANTITY"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Addon type must be either BOOLEAN or QUANTITY",
        });
      }

      // Validate SKU - check for duplicates within organization
      const trimmedSku = sku ? String(sku).trim() : null;
      if (trimmedSku) {
        // Check if SKU already exists in this organization
        const existingAddonWithSku = await prisma.addOn.findFirst({
          where: {
            organizationId,
            sku: trimmedSku,
          },
        });
        if (existingAddonWithSku) {
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

      // Validate categoryIds if provided
      const categoryIdsArray = Array.isArray(categoryIds) ? categoryIds : categoryIds ? [categoryIds] : [];
      if (categoryIdsArray.length > 0) {
        const categories = await prisma.category.findMany({
          where: { id: { in: categoryIdsArray }, organizationId },
        });
        if (categories.length !== categoryIdsArray.length) {
          return res.status(400).json({
            success: false,
            message: "One or more category IDs are invalid",
          });
        }
      }

      const addon = await prisma.$transaction(async (tx) => {
        const basePrice = parseFloat(price);
        
        const newAddon = await tx.addOn.create({
          data: {
            organizationId,
            name: name.trim(),
            nameFa: nameFa?.trim() || null,
            description: description?.trim() || null,
            descriptionFa: descriptionFa?.trim() || null,
            sku: trimmedSku, // Store SKU
            price: basePrice, // Store base price
            taxPercentage:
              taxPercentage !== undefined ? parseFloat(taxPercentage) : null,
            image: image?.trim() || null,
            type: type as "BOOLEAN" | "QUANTITY",
            excludedBranches: excludedBranchIds,
            isActive: Boolean(isActive),
            addonCategories: {
              create: categoryIdsArray.map((categoryId: string) => ({
                categoryId: categoryId.trim(),
              })),
            },
          },
        });

        // Create addon sizes with final prices (basePrice + additional price)
        await tx.addonSize.createMany({
          data: sizes.map((size: any) => ({
            addonId: newAddon.id,
            sizeType: size.sizeType,
            price: basePrice + parseFloat(size.price), // Final price = base + additional
            taxPercentage:
              size.taxPercentage !== undefined
                ? parseFloat(size.taxPercentage)
                : null,
          })),
        });

        return newAddon;
      });

      // Fetch complete addon with relations
      const completeAddon = await prisma.addOn.findUnique({
        where: { id: addon.id },
        include: {
          addonCategories: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          addonSizes: true,
          _count: {
            select: {
              mealAddOns: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: completeAddon,
        message: "Addon created successfully",
      });
    } catch (error) {
      console.error("Error creating addon:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create addon",
      });
    }
  },

  // Update addon
  updateAddon: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;
      const { name, nameFa, description, descriptionFa, sku, price, sizes, taxPercentage, image, type, excludedBranches, isActive, categoryIds } =
        req.body;

      // Check if addon exists
      const existingAddon = await prisma.addOn.findUnique({
        where: { id },
      });

      if (!existingAddon) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      const existingAddonOrgId = (existingAddon as any).organizationId as string | null | undefined;
      if (existingAddonOrgId && existingAddonOrgId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      // Validate SKU - check for duplicates within organization (excluding current addon)
      const trimmedSku = sku ? String(sku).trim() : null;
      if (trimmedSku && trimmedSku !== (existingAddon as any)?.sku) {
        // Check if SKU already exists in this organization (excluding current addon)
        const existingAddonWithSku = await prisma.addOn.findFirst({
          where: {
            organizationId,
            sku: trimmedSku,
            id: { not: id }, // Exclude current addon
          },
        });
        if (existingAddonWithSku) {
          return res.status(400).json({
            success: false,
            message: "SKU already exists in this organization",
          });
        }
      }

      // Validate type if provided
      if (type && !["BOOLEAN", "QUANTITY"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Addon type must be either BOOLEAN or QUANTITY",
        });
      }

      // Validate sizes if provided
      if (sizes !== undefined) {
        if (!Array.isArray(sizes) || sizes.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one addon size is required",
          });
        }
        for (const size of sizes) {
          if (!size.sizeType || !["S", "M", "L", "XL"].includes(size.sizeType)) {
            return res.status(400).json({
              success: false,
              message: "Each size must have a valid sizeType (S, M, L, XL)",
            });
          }
          if (size.price === undefined || size.price < 0) {
            return res.status(400).json({
              success: false,
              message: "Each size must have a non-negative price",
            });
          }
        }
      }

      // Validate categoryIds if provided
      const categoryIdsArray = categoryIds !== undefined 
        ? (Array.isArray(categoryIds) ? categoryIds : categoryIds ? [categoryIds] : [])
        : undefined;
      
      if (categoryIdsArray !== undefined && categoryIdsArray.length > 0) {
        const categories = await prisma.category.findMany({
          where: { id: { in: categoryIdsArray }, organizationId },
        });
        if (categories.length !== categoryIdsArray.length) {
          return res.status(400).json({
            success: false,
            message: "One or more category IDs are invalid",
          });
        }
      }

      const excludedBranchIds: string[] = excludedBranches !== undefined
        ? (Array.isArray(excludedBranches)
            ? excludedBranches.filter((v: any) => typeof v === "string" && v.trim().length > 0)
            : [])
        : [];

      if (excludedBranches !== undefined && excludedBranchIds.length > 0) {
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

      const result = await prisma.$transaction(async (tx) => {
        const updateData: any = {};

        // Legacy multi-org migration: if this addon is unscoped (organizationId null),
        // claim it into the resolved organization on first edit.
        if (!existingAddonOrgId) {
          updateData.organizationId = organizationId;
        }
        if (name !== undefined) updateData.name = name.trim();
        if (nameFa !== undefined) updateData.nameFa = nameFa?.trim() || null;
        if (description !== undefined)
          updateData.description = description?.trim() || null;
        if (descriptionFa !== undefined)
          updateData.descriptionFa = descriptionFa?.trim() || null;
        if (trimmedSku !== undefined) updateData.sku = trimmedSku;
        if (price !== undefined) {
          if (price < 0) {
            throw new Error("Base price must be non-negative");
          }
          updateData.price = parseFloat(price);
        }
        if (taxPercentage !== undefined)
          updateData.taxPercentage =
            taxPercentage !== null ? parseFloat(taxPercentage) : null;
        if (image !== undefined) updateData.image = image?.trim() || null;
        if (type !== undefined) updateData.type = type;
        if (excludedBranches !== undefined) {
          updateData.excludedBranches = excludedBranchIds;
        }
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);

        // Handle categoryIds update
        if (categoryIdsArray !== undefined) {
          // Delete existing category associations
          await tx.addonCategory.deleteMany({
            where: { addonId: id },
          });
          // Create new associations if any
          if (categoryIdsArray.length > 0) {
            updateData.addonCategories = {
              create: categoryIdsArray.map((categoryId: string) => ({
                categoryId: categoryId.trim(),
              })),
            };
          }
        }

        const addon = await tx.addOn.update({
          where: { id },
          data: updateData,
        });

        // Update addon sizes if provided
        if (sizes !== undefined) {
          // Get current base price (use updated price if provided, otherwise existing)
          const currentBasePrice = price !== undefined 
            ? parseFloat(price) 
            : (existingAddon.price ? Number(existingAddon.price) : 0);
          
          // Delete existing sizes
          await tx.addonSize.deleteMany({
            where: { addonId: id },
          });

          // Create new sizes with final prices (basePrice + additional price)
          if (sizes.length > 0) {
            await tx.addonSize.createMany({
              data: sizes.map((size: any) => ({
                addonId: id,
                sizeType: size.sizeType,
                price: currentBasePrice + parseFloat(size.price), // Final price = base + additional
                taxPercentage:
                  size.taxPercentage !== undefined
                    ? parseFloat(size.taxPercentage)
                    : null,
              })),
            });
          }
        }

        return addon;
      });

      // Fetch complete addon with relations
      const completeAddon = await prisma.addOn.findUnique({
        where: { id: result.id },
        include: {
          addonCategories: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          addonSizes: true,
          mealAddOns: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: {
              mealAddOns: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: completeAddon,
        message: "Addon updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating addon:", error);
      if (error.message === "Base price must be non-negative") {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: "Failed to update addon",
      });
    }
  },

  // Delete addon
  deleteAddon: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      // Check if addon exists
      const existingAddon = await prisma.addOn.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              mealAddOns: true,
            },
          },
        },
      });

      if (!existingAddon || (existingAddon as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      // Check if addon is used by meals
      if (existingAddon._count.mealAddOns > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete addon. It is used by ${existingAddon._count.mealAddOns} meal(s).`,
        });
      }

      await prisma.addOn.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: "Addon deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting addon:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete addon",
      });
    }
  },

  // Toggle addon status
  toggleAddonStatus: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { id } = req.params;

      const addon = await prisma.addOn.findUnique({
        where: { id },
      });

      if (!addon || (addon as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      const updatedAddon = await prisma.addOn.update({
        where: { id },
        data: {
          isActive: !addon.isActive,
        },
        include: {
          addonSizes: true,
          _count: {
            select: {
              mealAddOns: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: updatedAddon,
        message: `Addon ${
          updatedAddon.isActive ? "activated" : "deactivated"
        } successfully`,
      });
    } catch (error) {
      console.error("Error toggling addon status:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to toggle addon status",
      });
    }
  },

  // Get all branch prices for an addon
  getAddonBranchPrices: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { addonId } = req.params;

      const addon = await prisma.addOn.findUnique({
        where: { id: addonId },
        select: { id: true, organizationId: true },
      });

      if (!addon) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      const addonOrgId = (addon as any).organizationId as string | null | undefined;
      if (addonOrgId && addonOrgId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      const rbacUser = (req as RBACRequest).rbacUser;
      let allowedBranchIds: string[] | null = null;
      if (rbacUser) {
        const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
        const orgRole = (rbacUser as any).orgRole as string | null | undefined;
        const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

        if (isOrgAdmin) {
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
      }

      const branchPrices = await prisma.addonBranchPrice.findMany({
        where: {
          addonId,
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
      console.error("Error fetching addon branch prices:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch addon branch prices",
      });
    }
  },

  // Create or update branch price for an addon
  upsertAddonBranchPrice: async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { addonId } = req.params;
      const { branchId, basePrice, taxPercentage } = req.body;

      const rbacUser = (req as RBACRequest).rbacUser;
      if (rbacUser && !hasImplicitFullAccess(rbacUser.userType)) {
        const allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res
            .status(403)
            .json({ success: false, message: "No branch access assigned" });
        }
        if (branchId && !allowedBranchIds.includes(branchId)) {
          return res.status(403).json({
            success: false,
            message: "You don't have access to this branch",
          });
        }
      }

      if (!branchId || basePrice === undefined) {
        return res.status(400).json({
          success: false,
          message: "branchId and basePrice are required",
        });
      }

      // Verify addon exists
      const addon = await prisma.addOn.findUnique({
        where: { id: addonId },
      });

      if (!addon || (addon as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      // Verify branch exists
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, organizationId: true },
      });

      if (!branch || (branch as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Branch not found",
        });
      }

      const branchPrice = await prisma.addonBranchPrice.upsert({
        where: {
          addonId_branchId: {
            addonId,
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
          addonId,
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
      console.error("Error upserting addon branch price:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to save addon branch price",
      });
    }
  },

  // Delete branch price for an addon
  deleteAddonBranchPrice: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const { addonId, branchId } = req.params;

      const addon = await prisma.addOn.findUnique({
        where: { id: addonId },
        select: { id: true, organizationId: true },
      });

      if (!addon || (addon as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, organizationId: true },
      });

      if (!branch || (branch as any).organizationId !== organizationId) {
        return res.status(404).json({
          success: false,
          message: "Branch not found",
        });
      }

      const rbacUser = (req as RBACRequest).rbacUser;
      if (rbacUser && !hasImplicitFullAccess(rbacUser.userType)) {
        const allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          return res
            .status(403)
            .json({ success: false, message: "No branch access assigned" });
        }
        if (branchId && !allowedBranchIds.includes(branchId)) {
          return res.status(403).json({
            success: false,
            message: "You don't have access to this branch",
          });
        }
      }

      if (!branchId) {
        return res.status(400).json({
          success: false,
          message: "branchId is required",
        });
      }

      await prisma.addonBranchPrice.delete({
        where: {
          addonId_branchId: {
            addonId,
            branchId,
          },
        },
      });

      return res.json({
        success: true,
        message: "Branch price deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting addon branch price:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete addon branch price",
      });
    }
  },

  // SUPER_ADMIN: Move addon to a different organization
  setAddonOrganization: async (req: RBACRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      // Verify addon exists
      const addon = await prisma.addOn.findUnique({
        where: { id },
        include: {
          addonCategories: true,
          addonBranchPrices: true,
        },
      });

      if (!addon) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
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
      const filteredExcludedBranches = (addon.excludedBranches || []).filter(
        (branchId) => targetBranchIds.has(branchId)
      );

      // Get categories in target org to filter addonCategories
      const targetOrgCategories = await prisma.category.findMany({
        where: { organizationId },
        select: { id: true },
      });
      const targetCategoryIds = new Set(targetOrgCategories.map((c) => c.id));

      // Determine which addonCategory links to remove (categories not in target org)
      const addonCategoryIdsToRemove = addon.addonCategories
        .filter((ac) => !targetCategoryIds.has(ac.categoryId))
        .map((ac) => ac.id);

      // Determine which branch prices to remove (branches not in target org)
      const branchPriceIdsToRemove = addon.addonBranchPrices
        .filter((bp) => !targetBranchIds.has(bp.branchId))
        .map((bp) => bp.id);

      // Update addon and cleanup in transaction
      await prisma.$transaction(async (tx) => {
        // Remove addonCategory links to categories not in target org
        if (addonCategoryIdsToRemove.length > 0) {
          await tx.addonCategory.deleteMany({
            where: { id: { in: addonCategoryIdsToRemove } },
          });
        }

        // Remove branch prices for branches not in target org
        if (branchPriceIdsToRemove.length > 0) {
          await tx.addonBranchPrice.deleteMany({
            where: { id: { in: branchPriceIdsToRemove } },
          });
        }

        // Update addon
        await tx.addOn.update({
          where: { id },
          data: {
            organizationId,
            excludedBranches: filteredExcludedBranches,
          },
        });
      });

      const updated = await prisma.addOn.findUnique({
        where: { id },
        include: {
          addonCategories: {
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          },
          addonSizes: true,
          _count: {
            select: { mealAddOns: true },
          },
        },
      });

      return res.json({
        success: true,
        data: updated,
        message: "Addon moved to organization successfully",
      });
    } catch (error) {
      console.error("Error moving addon:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to move addon",
      });
    }
  },

  // SUPER_ADMIN: Copy addons to a different organization (bulk)
  copyAddonsToOrganization: async (req: RBACRequest, res: Response) => {
    try {
      const { ids, organizationId } = (req.body || {}) as {
        ids?: unknown;
        organizationId?: unknown;
      };

      const addonIds = Array.isArray(ids) ? (ids as unknown[]).map(String).filter(Boolean) : [];
      const targetOrgId = typeof organizationId === "string" ? organizationId.trim() : "";

      if (addonIds.length === 0) {
        return res.status(400).json({ success: false, message: "ids is required" });
      }
      if (!targetOrgId) {
        return res.status(400).json({ success: false, message: "organizationId is required" });
      }

      const targetOrg = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { id: true } });
      if (!targetOrg) {
        return res.status(404).json({ success: false, message: "Target organization not found" });
      }

      const addons = await prisma.addOn.findMany({
        where: { id: { in: addonIds } },
        include: {
          addonSizes: true,
          addonCategories: true,
          addonBranchPrices: true,
        },
      });

      if (addons.length !== addonIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more addons not found",
        });
      }

      const targetOrgBranches = await prisma.branch.findMany({
        where: { organizationId: targetOrgId },
        select: { id: true },
      });
      const targetBranchIds = new Set(targetOrgBranches.map((b) => b.id));

      const targetOrgCategories = await prisma.category.findMany({
        where: { organizationId: targetOrgId },
        select: { id: true },
      });
      const targetCategoryIds = new Set(targetOrgCategories.map((c) => c.id));

      const created = await prisma.$transaction(async (tx) => {
        const createdAddons: any[] = [];

        for (const a of addons) {
          const filteredExcludedBranches = (a.excludedBranches || []).filter((bid) => targetBranchIds.has(bid));

          const newAddon = await tx.addOn.create({
            data: {
              organizationId: targetOrgId,
              name: a.name,
              description: a.description,
              price: a.price,
              taxPercentage: a.taxPercentage,
              image: a.image,
              type: a.type,
              isActive: a.isActive,
              excludedBranches: filteredExcludedBranches,
            },
          });

          if (Array.isArray(a.addonSizes) && a.addonSizes.length > 0) {
            await tx.addonSize.createMany({
              data: a.addonSizes.map((s) => ({
                addonId: newAddon.id,
                sizeType: s.sizeType,
                price: s.price,
                taxPercentage: s.taxPercentage,
              })),
              skipDuplicates: true,
            });
          }

          const categoryLinks = (a.addonCategories || [])
            .filter((l) => targetCategoryIds.has(l.categoryId))
            .map((l) => ({ addonId: newAddon.id, categoryId: l.categoryId }));
          if (categoryLinks.length > 0) {
            await tx.addonCategory.createMany({ data: categoryLinks, skipDuplicates: true });
          }

          const branchPrices = (a.addonBranchPrices || [])
            .filter((bp) => targetBranchIds.has(bp.branchId))
            .map((bp) => ({
              addonId: newAddon.id,
              branchId: bp.branchId,
              basePrice: bp.basePrice,
              taxPercentage: bp.taxPercentage,
            }));
          if (branchPrices.length > 0) {
            await tx.addonBranchPrice.createMany({ data: branchPrices, skipDuplicates: true });
          }

          const hydrated = await tx.addOn.findUnique({
            where: { id: newAddon.id },
            include: {
              addonCategories: {
                include: {
                  category: { select: { id: true, name: true } },
                },
              },
              addonSizes: true,
              _count: { select: { mealAddOns: true } },
            },
          });

          createdAddons.push(hydrated);
        }

        return createdAddons;
      });

      return res.json({
        success: true,
        data: created,
        count: created.length,
        message: "Addons copied successfully",
      });
    } catch (error) {
      console.error("Error copying addons:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to copy addons",
      });
    }
  },
};
