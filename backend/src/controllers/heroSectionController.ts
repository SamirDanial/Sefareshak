import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types";
import DatabaseSingleton from "../config/database";
import { hasImplicitFullAccess } from "../config/permissions";
import { AuditLogService } from "../services/auditLogService";

export class HeroSectionController {
  private getScopedOrganizationId = (req: Request): string | null => {
    const rbacUser = (req as any).rbacUser as
      | { userType?: string; organizationId?: string | null }
      | undefined;

    const resolvedOrgId = (req as any).organizationId as string | undefined;

    // If not authenticated, only allow org scoping via header (public endpoints)
    if (!rbacUser) {
      const headerVal = (req.headers["x-organization-id"] as string | undefined) || "";
      return headerVal.trim().length > 0 ? headerVal.trim() : null;
    }

    const isSuperAdmin = rbacUser.userType
      ? hasImplicitFullAccess(rbacUser.userType as any)
      : false;
    if (isSuperAdmin) {
      if (resolvedOrgId) return resolvedOrgId;
      const headerVal = (req.headers["x-organization-id"] as string | undefined) || "";
      return headerVal.trim().length > 0 ? headerVal.trim() : null;
    }

    return rbacUser.organizationId ? String(rbacUser.organizationId) : null;
  };

  // Get active hero section (public endpoint)
  public getActiveHeroSection = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const organizationId = this.getScopedOrganizationId(req);

      // Prefer org hero (if available), otherwise fall back to global hero
      if (organizationId) {
        const orgHero = await prisma.heroSection.findFirst({
          where: { isActive: true, organizationId },
          orderBy: { updatedAt: "desc" },
        });
        if (orgHero) {
          res.json({ success: true, data: orgHero });
          return;
        }
      }

      const heroSection = await prisma.heroSection.findFirst({
        where: { isActive: true, organizationId: null },
        orderBy: { updatedAt: "desc" },
      });

      if (!heroSection) {
        res.json({
          success: true,
          data: null,
        });
        return;
      }

      res.json({
        success: true,
        data: heroSection,
      });
    } catch (error) {
      console.error("Error fetching hero section:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch hero section",
      });
    }
  };

  // Get all hero sections (admin only)
  public getAllHeroSections = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const organizationId = this.getScopedOrganizationId(req);

      const heroSections = await prisma.heroSection.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
      });

      res.json({
        success: true,
        data: heroSections,
      });
    } catch (error) {
      console.error("Error fetching hero sections:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch hero sections",
      });
    }
  };

  // Get hero section by ID (admin only)
  public getHeroSectionById = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { id } = req.params;

      const organizationId = this.getScopedOrganizationId(req);

      const heroSection = await prisma.heroSection.findUnique({
        where: { id },
      });

      if (!heroSection) {
        res.status(404).json({
          success: false,
          error: "Hero section not found",
        });
        return;
      }

      res.json({
        success: true,
        data: heroSection,
      });
    } catch (error) {
      console.error("Error fetching hero section:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch hero section",
      });
    }
  };

  // Create hero section (admin only)
  public createHeroSection = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const organizationId = this.getScopedOrganizationId(req);

      const {
        badgeText,
        title,
        subtitle,
        backgroundImage,
        primaryButtonText,
        primaryButtonLink,
        secondaryButtonText,
        secondaryButtonLink,
        isActive,
      } = req.body;

      // Validate required fields
      if (!title) {
        res.status(400).json({
          success: false,
          error: "Title is required",
        });
        return;
      }

      const nextActive = isActive !== undefined ? Boolean(isActive) : true;

      // Enforce single hero per scope by upserting.
      // Note: organizationId is nullable, so we cannot use a DB unique constraint for global;
      // we enforce it here by finding the existing global record.
      const existing = await prisma.heroSection.findFirst({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
      });

      const heroSection = existing
        ? await prisma.heroSection.update({
            where: { id: existing.id },
            data: {
              badgeText: badgeText !== undefined ? badgeText || null : existing.badgeText,
              title: title !== undefined ? title : existing.title,
              subtitle: subtitle !== undefined ? subtitle || null : existing.subtitle,
              backgroundImage:
                backgroundImage !== undefined ? backgroundImage || null : existing.backgroundImage,
              primaryButtonText:
                primaryButtonText !== undefined ? primaryButtonText || null : existing.primaryButtonText,
              primaryButtonLink:
                primaryButtonLink !== undefined ? primaryButtonLink || null : existing.primaryButtonLink,
              secondaryButtonText:
                secondaryButtonText !== undefined ? secondaryButtonText || null : existing.secondaryButtonText,
              secondaryButtonLink:
                secondaryButtonLink !== undefined ? secondaryButtonLink || null : existing.secondaryButtonLink,
              isActive: nextActive,
            },
          })
        : await prisma.heroSection.create({
            data: {
              organizationId,
              badgeText: badgeText || null,
              title,
              subtitle: subtitle || null,
              backgroundImage: backgroundImage || null,
              primaryButtonText: primaryButtonText || null,
              primaryButtonLink: primaryButtonLink || null,
              secondaryButtonText: secondaryButtonText || null,
              secondaryButtonLink: secondaryButtonLink || null,
              isActive: nextActive,
            },
          });

      await AuditLogService.writeSafe({
        action: "HERO_SECTION_UPSERT",
        entityType: "HeroSection",
        entityId: heroSection?.id || null,
        scope: { organizationId: organizationId || null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existing,
        after: heroSection,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        data: heroSection,
        message: "Hero section created successfully",
      });
    } catch (error) {
      console.error("Error creating hero section:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create hero section",
      });
    }
  };

  // Update hero section (admin only)
  public updateHeroSection = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { id } = req.params;

      const organizationId = this.getScopedOrganizationId(req);

      const {
        badgeText,
        title,
        subtitle,
        backgroundImage,
        primaryButtonText,
        primaryButtonLink,
        secondaryButtonText,
        secondaryButtonLink,
        isActive,
      } = req.body;

      // Check if hero section exists
      const existingHeroSection = await prisma.heroSection.findUnique({
        where: { id },
      });

      if (!existingHeroSection) {
        res.status(404).json({
          success: false,
          error: "Hero section not found",
        });
        return;
      }

      if ((existingHeroSection as any).organizationId !== organizationId) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      // With single hero per scope, "activate" is just a flag.

      const updateData: any = {};
      if (badgeText !== undefined) updateData.badgeText = badgeText || null;
      if (title !== undefined) updateData.title = title;
      if (subtitle !== undefined) updateData.subtitle = subtitle || null;
      if (backgroundImage !== undefined)
        updateData.backgroundImage = backgroundImage || null;
      if (primaryButtonText !== undefined)
        updateData.primaryButtonText = primaryButtonText || null;
      if (primaryButtonLink !== undefined)
        updateData.primaryButtonLink = primaryButtonLink || null;
      if (secondaryButtonText !== undefined)
        updateData.secondaryButtonText = secondaryButtonText || null;
      if (secondaryButtonLink !== undefined)
        updateData.secondaryButtonLink = secondaryButtonLink || null;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updatedHeroSection = await prisma.heroSection.update({
        where: { id },
        data: updateData,
      });

      await AuditLogService.writeSafe({
        action: "HERO_SECTION_UPDATE",
        entityType: "HeroSection",
        entityId: id,
        scope: { organizationId: organizationId || null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existingHeroSection,
        after: updatedHeroSection,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        data: updatedHeroSection,
        message: "Hero section updated successfully",
      });
    } catch (error) {
      console.error("Error updating hero section:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update hero section",
      });
    }
  };

  // Delete hero section (admin only)
  public deleteHeroSection = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { id } = req.params;

      const organizationId = this.getScopedOrganizationId(req);

      // Check if hero section exists
      const existingHeroSection = await prisma.heroSection.findUnique({
        where: { id },
      });

      if (!existingHeroSection) {
        res.status(404).json({
          success: false,
          error: "Hero section not found",
        });
        return;
      }

      if ((existingHeroSection as any).organizationId !== organizationId) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      await prisma.heroSection.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Hero section deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting hero section:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete hero section",
      });
    }
  };
}
