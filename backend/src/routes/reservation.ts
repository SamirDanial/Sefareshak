import { Router } from "express";
import { ReservationController } from "../controllers/reservationController";
import { ReservationService } from "../services/reservationService";
import AuthMiddleware from "../middleware/auth";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import DatabaseSingleton from "../config/database";
import type { AuthenticatedRequest } from "../types";
import WebSocketService from "../services/websocketService";

const router = Router();
const reservationController = new ReservationController();
const authMiddleware = AuthMiddleware.getInstance();
const rbac = RBACMiddleware.getInstance();

const requireOrgSelectionForSuperAdmin = (req: any, res: any, next: any) => {
  const rbacUser = req.rbacUser;
  if (rbacUser?.userType !== "SUPER_ADMIN") {
    next();
    return;
  }

  const headerVal = req.headers?.["x-organization-id"];
  const queryVal = req.query?.organizationId;
  const hasOrg =
    (typeof headerVal === "string" && headerVal.trim()) ||
    (typeof queryVal === "string" && queryVal.trim());

  if (!hasOrg) {
    res.status(400).json({
      success: false,
      error: "Organization selection is required",
    });
    return;
  }

  next();
};

const requireBranchInResolvedOrg = (branchIdSource: "query" | "body", key: string) => {
  return async (req: any, res: any, next: any) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const branchId =
        branchIdSource === "query" ? (req.query?.[key] as string | undefined) : (req.body?.[key] as string | undefined);
      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({ success: false, error: `${key} is required` });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
        select: { id: true, organizationId: true },
      });

      if (!branch || branch.organizationId !== organizationId) {
        res.status(403).json({ success: false, error: "Access denied for this branch" });
        return;
      }

      next();
    } catch (error) {
      console.error("Branch/org scope check failed:", error);
      res.status(500).json({ success: false, error: "Failed to validate branch scope" });
    }
  };
};

const requireTableInResolvedOrg = () => {
  return async (req: any, res: any, next: any) => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const tableId = req.params?.id as string | undefined;
      if (!tableId) {
        res.status(400).json({ success: false, error: "id is required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const table = await db.getPrisma().table.findUnique({
        where: { id: tableId },
        select: { id: true, branch: { select: { organizationId: true } } },
      });

      if (!table || !table.branch?.organizationId || table.branch.organizationId !== organizationId) {
        res.status(403).json({ success: false, error: "Access denied for this table" });
        return;
      }

      next();
    } catch (error) {
      console.error("Table/org scope check failed:", error);
      res.status(500).json({ success: false, error: "Failed to validate table scope" });
    }
  };
};

// Settings endpoints
router.get(
  "/settings",
  authMiddleware.optionalAuth,
  reservationController.getSettings
);

router.get(
  "/settings/admin",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  async (req, res, next) => {
    const branchId = req.query?.branchId as string | undefined;
    if (!branchId) {
      next();
      return;
    }
    return requireBranchInResolvedOrg("query", "branchId")(req, res, next);
  },
  reservationController.getSettings
);

router.patch(
  "/settings",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  reservationController.updateSettings
);

// Availability endpoints
router.get(
  "/availability",
  authMiddleware.optionalAuth,
  reservationController.checkAvailability
);

router.get(
  "/time-slots",
  authMiddleware.optionalAuth,
  reservationController.getAvailableTimeSlots
);

// Public zones endpoint (customer-safe)
router.get(
  "/public/zones",
  authMiddleware.optionalAuth,
  async (req, res) => {
    try {
      const { branchId } = req.query;
      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({
          success: false,
          error: "branchId is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
        select: { id: true, isActive: true },
      });

      if (!branch || branch.isActive === false) {
        res.status(404).json({
          success: false,
          error: "Branch not found",
        });
        return;
      }

      const zones = await db.getPrisma().zone.findMany({
        where: { branchId, isActive: true },
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { tables: true },
          },
        },
      });

      res.json({
        success: true,
        data: zones,
      });
    } catch (error) {
      console.error("Error fetching public zones:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch zones",
      });
    }
  }
);

// Zone management endpoints - MUST be before table routes
router.get(
  "/zones",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.VIEW),
  requireBranchInResolvedOrg("query", "branchId"),
  async (req, res) => {
    try {
      const {
        branchId,
        page = "1",
        limit = "12",
        sortBy = "name",
        sortOrder = "asc",
        search,
        isActive,
      } = req.query;

      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "branchId is required",
        });
        return;
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause for filtering
      const where: any = {
        branchId: branchId as string,
      };

      // Search filter
      if (search) {
        where.OR = [
          {
            name: {
              contains: search as string,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: search as string,
              mode: "insensitive",
            },
          },
        ];
      }

      // Status filter
      if (isActive !== undefined && isActive !== "all") {
        where.isActive = isActive === "true";
      }

      // Build orderBy clause
      let orderBy: any = {};
      if (sortBy === "name") {
        orderBy.name = sortOrder as "asc" | "desc";
      } else if (sortBy === "createdAt") {
        orderBy.createdAt = sortOrder as "asc" | "desc";
      } else if (sortBy === "capacity") {
        orderBy.capacity = sortOrder as "asc" | "desc";
      } else {
        orderBy.name = "asc"; // Default
      }

      const db = DatabaseSingleton.getInstance();
      const [zones, totalCount] = await Promise.all([
        db.getPrisma().zone.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            _count: {
              select: { tables: true },
            },
          },
          orderBy,
        }),
        db.getPrisma().zone.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        success: true,
        data: zones,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalPages,
          totalCount,
        },
      });
    } catch (error) {
      console.error("Error fetching zones:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch zones",
      });
    }
  }
);

router.post(
  "/zones",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.CREATE),
  requireBranchInResolvedOrg("body", "branchId"),
  async (req, res) => {
    try {
      const { branchId, name, description, capacity } = req.body;

      if (!branchId || !name) {
        res.status(400).json({
          success: false,
          error: "branchId and name are required",
        });
        return;
      }

      // Verify branch exists
      const db = DatabaseSingleton.getInstance();
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
      });

      if (!branch) {
        res.status(404).json({
          success: false,
          error: "Branch not found",
        });
        return;
      }

      const zone = await db.getPrisma().zone.create({
        data: {
          branchId,
          name: name.trim(),
          description: description?.trim() || null,
          capacity: capacity ? Number(capacity) : null,
          isActive: true,
        },
      });

      res.status(201).json({
        success: true,
        data: zone,
      });
    } catch (error: any) {
      console.error("Error creating zone:", error);
      if (error.code === "P2002") {
        res.status(400).json({
          success: false,
          error: "Zone name already exists for this branch",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to create zone",
      });
    }
  }
);

router.patch(
  "/zones/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.UPDATE),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, capacity, isActive } = req.body;

      const db = DatabaseSingleton.getInstance();
      const zone = await db.getPrisma().zone.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(capacity !== undefined && { capacity: capacity ? Number(capacity) : null }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      res.json({
        success: true,
        data: zone,
      });
    } catch (error: any) {
      console.error("Error updating zone:", error);
      if (error.code === "P2002") {
        res.status(400).json({
          success: false,
          error: "Zone name already exists for this branch",
        });
        return;
      }
      if (error.code === "P2025") {
        res.status(404).json({
          success: false,
          error: "Zone not found",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update zone",
      });
    }
  }
);

router.delete(
  "/zones/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.DELETE),
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();

      // Check if zone has tables
      const tablesCount = await db.getPrisma().table.count({
        where: { zoneId: id },
      });

      if (tablesCount > 0) {
        res.status(400).json({
          success: false,
          error: `Cannot delete zone with ${tablesCount} table(s). Please reassign or delete tables first.`,
        });
        return;
      }

      await db.getPrisma().zone.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Zone deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting zone:", error);
      if (error.code === "P2025") {
        res.status(404).json({
          success: false,
          error: "Zone not found",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to delete zone",
      });
    }
  }
);

// Zone canvas settings endpoint
router.patch(
  "/zones/:id/canvas",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { canvasWidth, canvasHeight, backgroundImage } = req.body;

      const db = DatabaseSingleton.getInstance();
      const zone = await db.getPrisma().zone.update({
        where: { id },
        data: {
          ...(canvasWidth !== undefined && { canvasWidth: Number(canvasWidth) }),
          ...(canvasHeight !== undefined && { canvasHeight: Number(canvasHeight) }),
          ...(backgroundImage !== undefined && { backgroundImage }),
        },
      });

      res.json({
        success: true,
        data: zone,
      });
    } catch (error: any) {
      console.error("Error updating zone canvas:", error);
      if (error.code === "P2025") {
        res.status(404).json({
          success: false,
          error: "Zone not found",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update zone canvas settings",
      });
    }
  }
);

// Get zone with floor plan data (tables + floor elements)
router.get(
  "/zones/:id/floor-plan",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.VIEW_FLOOR_PLAN),
  async (req, res) => {
    try {
      const { id } = req.params;

      const db = DatabaseSingleton.getInstance();
      const zone = await db.getPrisma().zone.findUnique({
        where: { id },
        include: {
          tables: {
            where: { isActive: true },
            select: {
              id: true,
              tableNumber: true,
              capacity: true,
              status: true,
              positionX: true,
              positionY: true,
              width: true,
              height: true,
              rotation: true,
              shape: true,
            },
          },
          floorElements: true,
        },
      });

      if (!zone) {
        res.status(404).json({
          success: false,
          error: "Zone not found",
        });
        return;
      }

      res.json({
        success: true,
        data: zone,
      });
    } catch (error) {
      console.error("Error fetching zone floor plan:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch zone floor plan",
      });
    }
  }
);

router.post(
  "/zones/:zoneId/floor-elements",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN),
  async (req, res) => {
    try {
      const { zoneId } = req.params;
      const { type, label, positionX, positionY, width, height, rotation, color, icon } = req.body;

      if (!type) {
        res.status(400).json({
          success: false,
          error: "Element type is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Verify zone exists
      const zone = await db.getPrisma().zone.findUnique({
        where: { id: zoneId },
      });

      if (!zone) {
        res.status(404).json({
          success: false,
          error: "Zone not found",
        });
        return;
      }

      const floorElement = await db.getPrisma().floorElement.create({
        data: {
          zoneId,
          type,
          label: label || null,
          positionX: positionX ?? 0,
          positionY: positionY ?? 0,
          width: width ?? 50,
          height: height ?? 50,
          rotation: rotation ?? 0,
          color: color || null,
          icon: icon || null,
        },
      });

      res.status(201).json({
        success: true,
        data: floorElement,
      });
    } catch (error) {
      console.error("Error creating floor element:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create floor element",
      });
    }
  }
);

router.patch(
  "/floor-elements/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { type, label, positionX, positionY, width, height, rotation, color, icon } = req.body;

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const floorElement = await db.getPrisma().floorElement.update({
        where: { id },
        data: {
          ...(type !== undefined && { type }),
          ...(label !== undefined && { label }),
          ...(positionX !== undefined && { positionX: Number(positionX) }),
          ...(positionY !== undefined && { positionY: Number(positionY) }),
          ...(width !== undefined && { width: Number(width) }),
          ...(height !== undefined && { height: Number(height) }),
          ...(rotation !== undefined && { rotation: Number(rotation) }),
          ...(color !== undefined && { color }),
          ...(icon !== undefined && { icon }),
        },
      });

      if (process.env.NODE_ENV !== "production") {

        await prisma.floorElement.findUnique({
          where: { id },
          select: {
            id: true,
            zoneId: true,
            type: true,
            label: true,
            positionX: true,
            positionY: true,
            width: true,
            height: true,
            rotation: true,
            color: true,
            icon: true,
            updatedAt: true,
          },
        });
      }

      res.json({
        success: true,
        data: floorElement,
      });
    } catch (error: any) {
      console.error("Error updating floor element:", error);
      if (error.code === "P2025") {
        res.status(404).json({
          success: false,
          error: "Floor element not found",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update floor element",
      });
    }
  }
);

router.delete(
  "/floor-elements/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();

      await db.getPrisma().floorElement.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Floor element deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting floor element:", error);
      if (error.code === "P2025") {
        res.status(404).json({
          success: false,
          error: "Floor element not found",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to delete floor element",
      });
    }
  }
);

// Bulk update table positions for a zone
router.post(
  "/zones/:zoneId/tables/positions",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.TABLES, action: ACTIONS.UPDATE },
    { resource: RESOURCES.ZONES, action: ACTIONS.EDIT_FLOOR_PLAN },
  ]),
  async (req, res) => {
    try {
      const { zoneId } = req.params;
      const { tables } = req.body;

      if (!Array.isArray(tables)) {
        res.status(400).json({
          success: false,
          error: "tables array is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Verify zone exists
      const zone = await db.getPrisma().zone.findUnique({
        where: { id: zoneId },
      });

      if (!zone) {
        res.status(404).json({
          success: false,
          error: "Zone not found",
        });
        return;
      }

      // Update all tables in a transaction
      const updatedTables = await db.getPrisma().$transaction(
        tables.map((table: any) =>
          db.getPrisma().table.update({
            where: { id: table.id },
            data: {
              ...(table.positionX !== undefined && { positionX: Number(table.positionX) }),
              ...(table.positionY !== undefined && { positionY: Number(table.positionY) }),
              ...(table.width !== undefined && { width: Number(table.width) }),
              ...(table.height !== undefined && { height: Number(table.height) }),
              ...(table.rotation !== undefined && { rotation: Number(table.rotation) }),
              ...(table.shape !== undefined && { shape: table.shape }),
            },
          })
        )
      );

      res.json({
        success: true,
        data: updatedTables,
      });
    } catch (error) {
      console.error("Error updating table positions:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update table positions",
      });
    }
  }
);

// Table management endpoints (Medium tier) - MUST be before /:id routes
router.get(
  "/tables",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.TABLES, ACTIONS.VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        page = "1",
        limit = "12",
        sortBy = "tableNumber",
        sortOrder = "asc",
        search,
        status,
        zone,
        zoneId,
        isActive,
        branchId,
      } = req.query;

      // BRANCH_ADMIN must always query within a single branch.
      if (req.user?.userType === "BRANCH_ADMIN") {
        if (!branchId || typeof branchId !== "string") {
          res.status(400).json({
            success: false,
            error: "branchId is required",
          });
          return;
        }

        // Validate branch assignment using the DB (security enforcement)
        const db = DatabaseSingleton.getInstance();
        const assignment = await db.getPrisma().userBranch.findFirst({
          where: { userId: req.user.id, branchId },
        });
        if (!assignment) {
          res.status(403).json({
            success: false,
            error: "You don't have access to this branch",
          });
          return;
        }
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause for filtering
      const where: any = {};
      if (search) {
        where.tableNumber = {
          contains: search as string,
          mode: "insensitive",
        };
      }
      if (status) {
        where.status = status as string;
      }
      // Branch filter: tables may be linked to a branch either directly (table.branchId)
      // or indirectly via zoneRelation.branchId (table.branchId is nullable in schema).
      const branchOr = branchId
        ? [{ branchId: branchId as string }, { zoneRelation: { branchId: branchId as string } }]
        : null;
      if (zoneId) {
        if (zoneId === "__UNASSIGNED__") {
          where.zoneId = null;
        } else {
          where.zoneId = zoneId as string;
        }
      }
      // Legacy zone string filter (for backward compatibility)
      const legacyZoneOr = zone && !zoneId && zone === "__UNASSIGNED__"
        ? [{ zone: null }, { zone: "" }]
        : null;
      if (zone && !zoneId && zone !== "__UNASSIGNED__") {
        where.zone = zone as string;
      }

      // Combine OR filters safely
      if (legacyZoneOr && branchOr) {
        where.AND = [{ OR: legacyZoneOr }, { OR: branchOr }];
      } else if (legacyZoneOr) {
        where.OR = legacyZoneOr;
      } else if (branchOr) {
        where.OR = branchOr;
      }
      if (isActive !== undefined) {
        where.isActive = isActive === "true";
      }

      const db = DatabaseSingleton.getInstance();
      const [tables, totalCount] = await Promise.all([
        db.getPrisma().table.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            zoneRelation: true, // Include zone relation to get zone name
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            [sortBy as string]: sortOrder as "asc" | "desc",
          },
        }),
        db.getPrisma().table.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        success: true,
        data: tables,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalPages,
          totalCount,
        },
      });
    } catch (error) {
      console.error("Error fetching tables:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch tables",
      });
    }
  }
);

router.post(
  "/tables",
  rbac.authenticate,
  rbac.requirePermission(RESOURCES.TABLES, ACTIONS.CREATE),
  async (req, res) => {
    try {
      const { tableNumber, capacity, zone, zoneId, branchId, notes } = req.body;

      if (!tableNumber || !capacity) {
        res.status(400).json({
          success: false,
          error: "Table number and capacity are required",
        });
        return;
      }

      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "branchId is required",
        });
        return;
      }

      // Verify branch exists
      const db = DatabaseSingleton.getInstance();
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
      });

      if (!branch) {
        res.status(404).json({
          success: false,
          error: "Branch not found",
        });
        return;
      }

      // If zoneId provided, verify zone exists and belongs to branch
      if (zoneId) {
        const zone = await db.getPrisma().zone.findFirst({
          where: {
            id: zoneId,
            branchId: branchId,
          },
        });

        if (!zone) {
          res.status(400).json({
            success: false,
            error: "Zone not found or does not belong to this branch",
          });
          return;
        }
      }

      const table = await db.getPrisma().table.create({
        data: {
          tableNumber,
          capacity: Number(capacity),
          branchId,
          zoneId: zoneId || null,
          zone: zone || null, // Keep for backward compatibility
          notes,
        },
      });

      res.status(201).json({
        success: true,
        data: table,
      });
    } catch (error: any) {
      console.error("Error creating table:", error);
      if (error.code === "P2002") {
        res.status(400).json({
          success: false,
          error: "Table number already exists",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to create table",
      });
    }
  }
);

// User-facing table availability endpoint (for booking)
router.get(
  "/tables/availability/user",
  authMiddleware.optionalAuth,
  async (req, res) => {
    try {
      const { date, time, numberOfGuests, branchId, zoneId } = req.query;

      if (!date || !time || !numberOfGuests) {
        res.status(400).json({
          success: false,
          error: "Date, time, and numberOfGuests are required",
        });
        return;
      }

      const [hours, minutes] = (time as string).split(":").map(Number);
      // Parse date string (YYYY-MM-DD) as local date to avoid timezone issues
      const dateStr = date as string;
      const [year, month, day] = dateStr.split("-").map(Number);
      const dateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);

      const db = DatabaseSingleton.getInstance();

      // Validate branch is active if branchId provided
      if (branchId) {
        const branchCheck = await db.getPrisma().branch.findUnique({
          where: { id: branchId as string },
          select: { isActive: true },
        });
        if (!branchCheck || !branchCheck.isActive) {
          res.status(400).json({
            success: false,
            error: "Invalid or inactive branch",
          });
          return;
        }
      }

      // Get reservation settings (branch-specific if branchId provided, otherwise global)
      let reservationSettings;
      if (branchId) {
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId as string },
          select: {
            reservationTimeSlotInterval: true,
            reservationBufferTimeMinutes: true,
          },
        });
        // Get global settings as fallback
        const globalSettings = await db.getPrisma().reservationSettings.findFirst({
          where: { isEnabled: true },
        });
        // Merge: branch settings override global
        reservationSettings = {
          timeSlotInterval: branch?.reservationTimeSlotInterval ?? globalSettings?.timeSlotInterval ?? 30,
          bufferTimeMinutes: branch?.reservationBufferTimeMinutes ?? globalSettings?.bufferTimeMinutes ?? 15,
        };
      } else {
        reservationSettings = await db.getPrisma().reservationSettings.findFirst({
          where: { isEnabled: true },
        });
      }

      // Use timeSlotInterval from settings, default to 30 minutes if not set
      const RESERVATION_DURATION_MINUTES = reservationSettings?.timeSlotInterval || 30;
      // Get buffer time for table cleaning, default to 15 minutes if not set
      const BUFFER_TIME_MINUTES = reservationSettings?.bufferTimeMinutes || 15;

      const endTime = new Date(dateTime);
      endTime.setMinutes(endTime.getMinutes() + RESERVATION_DURATION_MINUTES);

      // Get start and end of the day for filtering reservations on the same day
      const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
      const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

      // Build where clause for table filtering
      const tableWhere: any = {
        isActive: true,
        status: {
          not: "OUT_OF_SERVICE",
        },
      };

      // Filter by branch if provided
      if (branchId) {
        tableWhere.branchId = branchId as string;
      }

      // Filter by zone if provided
      if (zoneId) {
        if (zoneId === "__UNASSIGNED__") {
          tableWhere.zoneId = null;
        } else {
          tableWhere.zoneId = zoneId as string;
        }
      }

      // Get all active tables (filtered by branch and zone if provided)
      const allTables = await db.getPrisma().table.findMany({
        where: tableWhere,
        include: {
          zoneRelation: true,
        },
        orderBy: [
          { zoneRelation: { name: "asc" } },
          { tableNumber: "asc" },
        ],
      });

      // Get reserved tables at this time with reservation details (from legacy tableId)
      // Only get reservations on the same day that could potentially overlap
      // A reservation could overlap if it starts before the requested end time (since reservations are 2 hours)
      const maxReservationStart = new Date(endTime);
      maxReservationStart.setMinutes(maxReservationStart.getMinutes() - RESERVATION_DURATION_MINUTES);
      
      const reservationWhereLegacy: any = {
        status: {
          in: ["PENDING", "CONFIRMED", "SEATED"],
        },
        reservationDate: {
          gte: dayStart,
          lte: dayEnd,
          lt: endTime, // Reservation must start before requested end time to potentially overlap
        },
        tableId: {
          not: null,
        },
      };

      // Filter by branch if provided
      if (branchId) {
        reservationWhereLegacy.branchId = branchId as string;
      }

      const allReservationsLegacy = await db.getPrisma().reservation.findMany({
        where: reservationWhereLegacy,
        select: {
          id: true,
          reservationNumber: true,
          tableId: true,
          reservationDate: true,
        },
      });

      // Filter for actual overlap: reservation must overlap with the requested time slot
      // Include buffer time after reservation ends for table cleaning
      const reservedTablesLegacy = allReservationsLegacy.filter((r) => {
        const reservationStart = new Date(r.reservationDate);
        const reservationEnd = new Date(r.reservationDate);
        reservationEnd.setMinutes(reservationEnd.getMinutes() + RESERVATION_DURATION_MINUTES);
        
        // Add buffer time after reservation ends for cleaning
        const reservationEndWithBuffer = new Date(reservationEnd);
        reservationEndWithBuffer.setMinutes(reservationEndWithBuffer.getMinutes() + BUFFER_TIME_MINUTES);
        
        // Two time ranges overlap if: reservation starts before requested end AND reservation ends (with buffer) after requested start
        const overlaps = reservationStart < endTime && reservationEndWithBuffer > dateTime;
        return overlaps;
      });

      // Get reserved tables from junction table
      // Only get reservations on the same day that could potentially overlap
      const reservationWhereJunction: any = {
        status: {
          in: ["PENDING", "CONFIRMED", "SEATED"],
        },
        reservationDate: {
          gte: dayStart,
          lte: dayEnd,
          lt: endTime, // Reservation must start before requested end time to potentially overlap
        },
      };

      // Filter by branch if provided
      if (branchId) {
        reservationWhereJunction.branchId = branchId as string;
      }

      const allReservationsJunction = await db.getPrisma().reservationTable.findMany({
        where: {
          reservation: reservationWhereJunction,
        },
        include: {
          reservation: {
            select: {
              id: true,
              reservationNumber: true,
              reservationDate: true,
            },
          },
        },
      });

      // Filter for actual overlap: reservation must overlap with the requested time slot
      // Include buffer time after reservation ends for table cleaning
      const reservedTablesJunction = allReservationsJunction.filter((rt) => {
        const reservationStart = new Date(rt.reservation.reservationDate);
        const reservationEnd = new Date(rt.reservation.reservationDate);
        reservationEnd.setMinutes(reservationEnd.getMinutes() + RESERVATION_DURATION_MINUTES);
        
        // Add buffer time after reservation ends for cleaning
        const reservationEndWithBuffer = new Date(reservationEnd);
        reservationEndWithBuffer.setMinutes(reservationEndWithBuffer.getMinutes() + BUFFER_TIME_MINUTES);
        
        // Check for overlap: reservation starts before requested end time AND reservation ends (with buffer) after requested start time
        return reservationStart < endTime && reservationEndWithBuffer > dateTime;
      });

      // Create a map of tableId -> reservation info
      const tableReservationMap = new Map<string, { id: string; reservationNumber: string }>();
      
      // Add legacy table assignments
      reservedTablesLegacy.forEach((r) => {
        if (r.tableId) {
          tableReservationMap.set(r.tableId, {
            id: r.id,
            reservationNumber: r.reservationNumber,
          });
        }
      });

      // Add junction table assignments
      reservedTablesJunction.forEach((rt) => {
        tableReservationMap.set(rt.tableId, {
          id: rt.reservation.id,
          reservationNumber: rt.reservation.reservationNumber,
        });
      });

      const reservedTableIds = new Set([
        ...reservedTablesLegacy.map((r) => r.tableId).filter(Boolean) as string[],
        ...reservedTablesJunction.map((rt) => rt.tableId),
      ]);

      // Add reservation info to tables with unavailability reason
      const tablesWithReservationInfo = allTables.map((table) => {
        const reservationInfo = tableReservationMap.get(table.id);
        const isReserved = reservationInfo !== undefined;
        
        // Determine if table is unavailable due to cleaning (buffer time) or actual reservation
        let unavailabilityReason: "reserved" | "cleaning" | null = null;
        if (isReserved) {
          // Check if the requested time falls within the buffer period
          // Find the reservation that makes this table unavailable
          let reservationInfoForTable: any = null;
          
          // Check legacy reservations
          for (const r of reservedTablesLegacy) {
            if (r.tableId === table.id) {
              reservationInfoForTable = r;
              break;
            }
          }
          
          // Check junction table reservations if not found
          if (!reservationInfoForTable) {
            for (const rt of reservedTablesJunction) {
              if (rt.tableId === table.id) {
                reservationInfoForTable = rt;
                break;
              }
            }
          }
          
          if (reservationInfoForTable) {
            const reservationStart = new Date(
              'reservationDate' in reservationInfoForTable 
                ? reservationInfoForTable.reservationDate 
                : reservationInfoForTable.reservation.reservationDate
            );
            const reservationEnd = new Date(reservationStart);
            reservationEnd.setMinutes(reservationEnd.getMinutes() + RESERVATION_DURATION_MINUTES);
            const reservationEndWithBuffer = new Date(reservationEnd);
            reservationEndWithBuffer.setMinutes(reservationEndWithBuffer.getMinutes() + BUFFER_TIME_MINUTES);
            
            // If requested time is after reservation end but before buffer end, it's cleaning time
            if (dateTime >= reservationEnd && dateTime < reservationEndWithBuffer) {
              unavailabilityReason = "cleaning";
            } else {
              unavailabilityReason = "reserved";
            }
          } else {
            unavailabilityReason = "reserved";
          }
        }
        
        return {
          ...table,
          isReserved,
          assignedReservation: reservationInfo || null,
          unavailabilityReason,
        };
      });

      const availableTables = tablesWithReservationInfo.filter(
        (t) => !t.isReserved
      );

      const reservedTables = tablesWithReservationInfo.filter(
        (t) => t.isReserved
      );

      res.json({
        success: true,
        data: {
          available: availableTables,
          reserved: reservedTables,
        },
      });
    } catch (error) {
      console.error("Error checking table availability:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check table availability",
      });
    }
  }
);

// Admin table availability endpoint
router.get(
  "/tables/availability",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.TABLES, ACTIONS.VIEW),
  async (req, res) => {
    try {
      const { date, time, numberOfGuests } = req.query;

      if (!date || !time || !numberOfGuests) {
        res.status(400).json({
          success: false,
          error: "Date, time, and numberOfGuests are required",
        });
        return;
      }

      const [hours, minutes] = (time as string).split(":").map(Number);
      const dateTime = new Date(date as string);
      dateTime.setHours(hours, minutes, 0, 0);

      const db = DatabaseSingleton.getInstance();

      // Get reservation settings to determine time slot interval (reservation duration) and buffer time
      const reservationSettings = await db.getPrisma().reservationSettings.findFirst({
        where: { isEnabled: true },
      });

      // Use timeSlotInterval from settings, default to 30 minutes if not set
      const RESERVATION_DURATION_MINUTES = reservationSettings?.timeSlotInterval || 30;
      // Get buffer time for table cleaning, default to 15 minutes if not set
      const BUFFER_TIME_MINUTES = reservationSettings?.bufferTimeMinutes || 15;

      const endTime = new Date(dateTime);
      endTime.setMinutes(endTime.getMinutes() + RESERVATION_DURATION_MINUTES);

      // Get start and end of the day for filtering reservations on the same day
      const dayStart = new Date(dateTime);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateTime);
      dayEnd.setHours(23, 59, 59, 999);

      // Get all active tables (remove capacity filter to allow selecting multiple smaller tables)
      const allTables = await db.getPrisma().table.findMany({
        where: {
          isActive: true,
        },
      });

      // Get reserved tables at this time with reservation details (from legacy tableId)
      // Only get reservations on the same day that could potentially overlap
      const allReservationsLegacy = await db.getPrisma().reservation.findMany({
        where: {
          status: {
            in: ["PENDING", "CONFIRMED", "SEATED"],
          },
          reservationDate: {
            gte: dayStart,
            lte: dayEnd,
            lt: endTime, // Reservation must start before requested end time to potentially overlap
          },
          tableId: {
            not: null,
          },
        },
        select: {
          id: true,
          reservationNumber: true,
          tableId: true,
          reservationDate: true,
        },
      });

      // Filter for actual overlap: reservation must overlap with the requested time slot
      // Include buffer time after reservation ends for table cleaning
      const reservedTablesLegacy = allReservationsLegacy.filter((r) => {
        const reservationStart = new Date(r.reservationDate);
        const reservationEnd = new Date(r.reservationDate);
        reservationEnd.setMinutes(reservationEnd.getMinutes() + RESERVATION_DURATION_MINUTES);
        
        // Add buffer time after reservation ends for cleaning
        const reservationEndWithBuffer = new Date(reservationEnd);
        reservationEndWithBuffer.setMinutes(reservationEndWithBuffer.getMinutes() + BUFFER_TIME_MINUTES);
        
        // Two time ranges overlap if: reservation starts before requested end AND reservation ends (with buffer) after requested start
        const overlaps = reservationStart < endTime && reservationEndWithBuffer > dateTime;
        return overlaps;
      });

      // Get reserved tables from junction table
      // Only get reservations on the same day that could potentially overlap
      const allReservationsJunction = await db.getPrisma().reservationTable.findMany({
        where: {
          reservation: {
            status: {
              in: ["PENDING", "CONFIRMED", "SEATED"],
            },
            reservationDate: {
              gte: dayStart,
              lte: dayEnd,
              lt: endTime, // Reservation must start before requested end time to potentially overlap
            },
          },
        },
        include: {
          reservation: {
            select: {
              id: true,
              reservationNumber: true,
              reservationDate: true,
            },
          },
        },
      });

      // Filter for actual overlap: reservation must overlap with the requested time slot
      // Include buffer time after reservation ends for table cleaning
      const reservedTablesJunction = allReservationsJunction.filter((rt) => {
        const reservationStart = new Date(rt.reservation.reservationDate);
        const reservationEnd = new Date(rt.reservation.reservationDate);
        reservationEnd.setMinutes(reservationEnd.getMinutes() + RESERVATION_DURATION_MINUTES);
        
        // Add buffer time after reservation ends for cleaning
        const reservationEndWithBuffer = new Date(reservationEnd);
        reservationEndWithBuffer.setMinutes(reservationEndWithBuffer.getMinutes() + BUFFER_TIME_MINUTES);
        
        // Two time ranges overlap if: reservation starts before requested end AND reservation ends (with buffer) after requested start
        const overlaps = reservationStart < endTime && reservationEndWithBuffer > dateTime;
        return overlaps;
      });

      // Create a map of tableId -> reservation info
      const tableReservationMap = new Map<string, { id: string; reservationNumber: string }>();
      
      // Add legacy table assignments
      reservedTablesLegacy.forEach((r) => {
        if (r.tableId) {
          tableReservationMap.set(r.tableId, {
            id: r.id,
            reservationNumber: r.reservationNumber,
          });
        }
      });

      // Add junction table assignments
      reservedTablesJunction.forEach((rt) => {
        tableReservationMap.set(rt.tableId, {
          id: rt.reservation.id,
          reservationNumber: rt.reservation.reservationNumber,
        });
      });

      const reservedTableIds = new Set([
        ...reservedTablesLegacy.map((r) => r.tableId).filter(Boolean) as string[],
        ...reservedTablesJunction.map((rt) => rt.tableId),
      ]);

      // Add reservation info to tables with unavailability reason
      const tablesWithReservationInfo = allTables.map((table) => {
        const reservationInfo = tableReservationMap.get(table.id);
        const isAssigned = reservationInfo !== undefined;
        
        // Determine if table is unavailable due to cleaning (buffer time) or actual reservation
        let unavailabilityReason: "reserved" | "cleaning" | null = null;
        if (isAssigned) {
          // Check if the requested time falls within the buffer period
          let reservationInfoForTable: any = null;
          
          // Check legacy reservations
          for (const r of reservedTablesLegacy) {
            if (r.tableId === table.id) {
              reservationInfoForTable = r;
              break;
            }
          }
          
          // Check junction table reservations if not found
          if (!reservationInfoForTable) {
            for (const rt of reservedTablesJunction) {
              if (rt.tableId === table.id) {
                reservationInfoForTable = rt;
                break;
              }
            }
          }
          
          if (reservationInfoForTable) {
            const reservationStart = new Date(
              'reservationDate' in reservationInfoForTable 
                ? reservationInfoForTable.reservationDate 
                : reservationInfoForTable.reservation.reservationDate
            );
            const reservationEnd = new Date(reservationStart);
            reservationEnd.setMinutes(reservationEnd.getMinutes() + RESERVATION_DURATION_MINUTES);
            const reservationEndWithBuffer = new Date(reservationEnd);
            reservationEndWithBuffer.setMinutes(reservationEndWithBuffer.getMinutes() + BUFFER_TIME_MINUTES);
            
            // If requested time is after reservation end but before buffer end, it's cleaning time
            if (dateTime >= reservationEnd && dateTime < reservationEndWithBuffer) {
              unavailabilityReason = "cleaning";
            } else {
              unavailabilityReason = "reserved";
            }
          } else {
            unavailabilityReason = "reserved";
          }
        }
        
        return {
          ...table,
          isAssigned,
          assignedReservation: reservationInfo || null,
          unavailabilityReason,
        };
      });

      const availableTables = tablesWithReservationInfo.filter(
        (t) => !t.isAssigned
      );

      const assignedTables = tablesWithReservationInfo.filter(
        (t) => t.isAssigned
      );

      res.json({
        success: true,
        data: {
          available: availableTables,
          assigned: assignedTables,
          reserved: assignedTables, // Keep for backward compatibility
        },
      });
    } catch (error) {
      console.error("Error checking table availability:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check table availability",
      });
    }
  }
);

// Table status grid endpoint (admin only) - comprehensive view for a date
// MUST be before /tables/:id route to avoid route conflicts
router.get(
  "/tables/status-grid",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.TABLE_STATUS_GRID, ACTIONS.VIEW),
  requireBranchInResolvedOrg("query", "branchId"),
  async (req, res) => {
    try {
      const { date, branchId, zoneId } = req.query;

      if (!date) {
        res.status(400).json({
          success: false,
          error: "Date is required",
        });
        return;
      }

      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "branchId is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const reservationService = ReservationService.getInstance();

      // Parse date string (YYYY-MM-DD)
      const [year, month, day] = (date as string).split("-").map(Number);
      const selectedDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      const dayOfWeek = selectedDate.getDay();

      // Get reservation settings for the branch
      const settings = await reservationService.getSettings(branchId as string);
      if (!settings || !settings.isEnabled) {
        res.status(400).json({
          success: false,
          error: "Reservations are not enabled for this branch",
        });
        return;
      }

      // Get operating hours for the day
      const hours = reservationService.getOperatingHoursForDay(settings, dayOfWeek);
      if (!hours.open || !hours.close) {
        res.json({
          success: true,
          data: {
            date: date,
            timeSlots: [],
            tables: [],
            message: "Restaurant is closed on this day",
          },
        });
        return;
      }

      // Generate time slots
      const timeSlotInterval = settings.timeSlotInterval || 30;
      const openMinutes = reservationService.timeToMinutes(hours.open);
      const closeMinutes = reservationService.timeToMinutes(hours.close);
      const timeSlots: string[] = [];

      for (let minutes = openMinutes; minutes < closeMinutes; minutes += timeSlotInterval) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        timeSlots.push(`${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
      }

      // Build where clause for table filtering
      const tableWhere: any = {
        isActive: true,
        status: {
          not: "OUT_OF_SERVICE",
        },
        branchId: branchId as string,
      };

      // Filter by zone if provided
      if (zoneId && zoneId !== "all" && zoneId !== "__UNASSIGNED__") {
        tableWhere.zoneId = zoneId as string;
      } else if (zoneId === "__UNASSIGNED__") {
        tableWhere.zoneId = null;
      }

      // Get all active tables for the branch (and optionally zone)
      const allTables = await db.getPrisma().table.findMany({
        where: tableWhere,
        include: {
          zoneRelation: true,
        },
        orderBy: [
          { zoneRelation: { name: "asc" } },
          { tableNumber: "asc" },
        ],
      });

      // Get all reservations for this date
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);

      const reservations = await db.getPrisma().reservation.findMany({
        where: {
          status: {
            in: ["PENDING", "CONFIRMED", "SEATED"],
          },
          reservationDate: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          tables: {
            include: {
              table: true,
            },
          },
        },
      });

      // Build grid data: tableId -> timeSlot -> reservationInfo
      const tablesWithStatus = allTables.map((table) => {
        const timeSlotStatus: Array<[string, {
          status: "AVAILABLE" | "RESERVED";
          reservation: any;
        }]> = [];

        for (const timeSlot of timeSlots) {
          const [slotHours, slotMinutes] = timeSlot.split(":").map(Number);
          const slotDateTime = new Date(selectedDate);
          slotDateTime.setHours(slotHours, slotMinutes, 0, 0);
          const slotEndDateTime = new Date(slotDateTime);
          slotEndDateTime.setMinutes(slotEndDateTime.getMinutes() + timeSlotInterval);

          let isReserved = false;
          let reservationInfo: any = null;

          // Check if this table is reserved for this time slot
          for (const reservation of reservations) {
            const reservationDateTime = new Date(reservation.reservationDate);
            const reservationEnd = new Date(reservationDateTime);
            reservationEnd.setMinutes(reservationEnd.getMinutes() + timeSlotInterval);

            // Check if table is associated with this reservation
            const isTableInReservation = (reservation.tables as any[])?.some(
              (rt: any) => rt.tableId === table.id
            ) || reservation.tableId === table.id;

            if (isTableInReservation && reservationDateTime < slotEndDateTime && reservationEnd > slotDateTime) {
              isReserved = true;
              reservationInfo = {
                reservationId: reservation.id,
                reservationNumber: reservation.reservationNumber,
                customerName: reservation.customerName,
                customerEmail: reservation.customerEmail,
                customerPhone: reservation.customerPhone,
                numberOfGuests: reservation.numberOfGuests,
                status: reservation.status,
                type: reservation.type,
                userId: reservation.userId,
                user: reservation.user,
                reservationDate: reservation.reservationDate,
                specialRequests: reservation.specialRequests,
                preferredZone: reservation.preferredZone,
                internalNotes: reservation.internalNotes,
                confirmedAt: reservation.confirmedAt,
                createdAt: reservation.createdAt,
                tables: reservation.tables?.map((rt: any) => ({
                  tableNumber: rt.table?.tableNumber,
                  zone: rt.table?.zone,
                  capacity: rt.table?.capacity,
                })) || [],
              };
              break;
            }
          }

          timeSlotStatus.push([
            timeSlot,
            {
              status: isReserved ? "RESERVED" : "AVAILABLE",
              reservation: reservationInfo,
            },
          ]);
        }

        return {
          id: table.id,
          tableNumber: table.tableNumber,
          capacity: table.capacity,
          zone: table.zoneRelation?.name || table.zone || null,
          zoneId: table.zoneId,
          status: table.status,
          timeSlots: Object.fromEntries(timeSlotStatus),
        };
      });

      res.json({
        success: true,
        data: {
          date: date,
          timeSlots: timeSlots,
          tables: tablesWithStatus,
          operatingHours: {
            open: hours.open,
            close: hours.close,
          },
        },
      });
    } catch (error) {
      console.error("Error getting table status grid:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get table status grid",
      });
    }
  }
);

router.get(
  "/tables/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.TABLES, ACTIONS.VIEW),
  requireTableInResolvedOrg(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();
      const table = await db.getPrisma().table.findUnique({
        where: { id },
        include: {
          reservations: {
            where: {
              status: {
                in: ["PENDING", "CONFIRMED", "SEATED"],
              },
            },
            orderBy: { reservationDate: "asc" },
          },
        },
      });

      if (!table) {
        res.status(404).json({
          success: false,
          error: "Table not found",
        });
        return;
      }

      res.json({
        success: true,
        data: table,
      });
    } catch (error) {
      console.error("Error fetching table:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch table",
      });
    }
  }
);

router.patch(
  "/tables/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.TABLES, ACTIONS.UPDATE),
  requireTableInResolvedOrg(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { tableNumber, capacity, zone, zoneId, branchId, status, isActive, notes } = req.body;

      const db = DatabaseSingleton.getInstance();

      // If zoneId provided, verify it exists and belongs to the branch
      if (zoneId !== undefined) {
        const table = await db.getPrisma().table.findUnique({
          where: { id },
          select: { branchId: true },
        });

        if (!table) {
          res.status(404).json({
            success: false,
            error: "Table not found",
          });
          return;
        }

        const targetBranchId = branchId || table.branchId;
        
        if (zoneId) {
          const zone = await db.getPrisma().zone.findFirst({
            where: {
              id: zoneId,
              branchId: targetBranchId,
            },
          });

          if (!zone) {
            res.status(400).json({
              success: false,
              error: "Zone not found or does not belong to this branch",
            });
            return;
          }
        }
      }

      // Prevent manual RESERVED status - tables can only be RESERVED through reservations
      if (status === "RESERVED") {
        res.status(400).json({
          success: false,
          error: "Cannot manually set table status to RESERVED. Tables are automatically reserved when assigned to a reservation.",
        });
        return;
      }

      const updateData: any = {
        ...(tableNumber && { tableNumber }),
        ...(capacity !== undefined && { capacity: Number(capacity) }),
        ...(status && { status }),
        ...(isActive !== undefined && { isActive }),
        ...(notes !== undefined && { notes }),
        ...(branchId && { branchId }),
        ...(zoneId !== undefined && { zoneId: zoneId || null }),
        ...(zone !== undefined && { zone: zone || null }), // Keep for backward compatibility
      };

      const updatedTable = await db.getPrisma().table.update({
        where: { id },
        data: updateData,
      });

      res.json({
        success: true,
        data: updatedTable,
      });
    } catch (error: any) {
      console.error("Error updating table:", error);
      if (error.code === "P2002") {
        res.status(400).json({
          success: false,
          error: "Table number already exists",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update table",
      });
    }
  }
);

router.delete(
  "/tables/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.TABLES, ACTIONS.DELETE),
  requireTableInResolvedOrg(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();

      // Check if table has active reservations
      const activeReservations = await db.getPrisma().reservation.count({
        where: {
          tableId: id,
          status: {
            in: ["PENDING", "CONFIRMED", "SEATED"],
          },
        },
      });

      if (activeReservations > 0) {
        res.status(400).json({
          success: false,
          error: "Cannot delete table with active reservations",
        });
        return;
      }

      await db.getPrisma().table.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Table deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting table:", error);
      if (error.code === "P2025") {
        res.status(404).json({
          success: false,
          error: "Table not found",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to delete table",
      });
    }
  }
);

// Update table position/shape for floor plan
router.patch(
  "/tables/:id/position",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.TABLES, action: ACTIONS.UPDATE },
    { resource: RESOURCES.ZONES, action: ACTIONS.EDIT_FLOOR_PLAN },
  ]),
  requireTableInResolvedOrg(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { positionX, positionY, width, height, rotation, shape } = req.body;

      const db = DatabaseSingleton.getInstance();
      const updatedTable = await db.getPrisma().table.update({
        where: { id },
        data: {
          ...(positionX !== undefined && { positionX: Number(positionX) }),
          ...(positionY !== undefined && { positionY: Number(positionY) }),
          ...(width !== undefined && { width: Number(width) }),
          ...(height !== undefined && { height: Number(height) }),
          ...(rotation !== undefined && { rotation: Number(rotation) }),
          ...(shape !== undefined && { shape }),
        },
      });

      res.json({
        success: true,
        data: updatedTable,
      });
    } catch (error: any) {
      console.error("Error updating table position:", error);
      if (error.code === "P2025") {
        res.status(404).json({
          success: false,
          error: "Table not found",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update table position",
      });
    }
  }
);

// Reservation CRUD endpoints
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.VIEW),
  reservationController.getAllReservations
);

router.get(
  "/user/my-reservations",
  authMiddleware.requireAuth,
  reservationController.getUserReservations
);

// Analytics endpoint (admin only)
router.get(
  "/analytics",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  rbac.requireAnyPermission([
    { resource: RESOURCES.ANALYTICS_RESERVATION, action: ACTIONS.VIEW },
    { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
  ]),
  reservationController.getReservationAnalytics
);

// Branch reservations chart endpoint (admin only)
router.get(
  "/analytics/branch-chart",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  rbac.requireAnyPermission([
    { resource: RESOURCES.ANALYTICS_RESERVATION, action: ACTIONS.VIEW },
    { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
  ]),
  reservationController.getBranchReservationsChart
);

router.get(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.VIEW),
  reservationController.getReservationById
);

router.post(
  "/",
  authMiddleware.requireAuth,
  reservationController.createSimpleReservation
);

router.post(
  "/pre-order",
  authMiddleware.requireAuth,
  reservationController.createPreOrderReservation
);

// ==================== TEMPORARY WAITER -> KITCHEN SUBMIT ENDPOINT ====================
// IMPORTANT (Future Waiter App Reference):
// This endpoint is intentionally added BEFORE the waiter application exists.
// The long-term design is ticket-per-submit (KOT/chit model): every waiter submit creates a NEW KitchenTicket.
// When the waiter app is implemented, this endpoint can be moved/renamed and RBAC can be adjusted
// to allow WAITER role access (e.g. a dedicated permission like KITCHEN.SUBMIT).
// For now we keep it protected behind existing RBAC permissions.
router.post(
  "/:id/kitchen-submit",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.KITCHEN, ACTIONS.MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const reservationId = String(req.params?.id || "").trim();
      const branchId = String((req.body as any)?.branchId || "").trim();
      const items = (req.body as any)?.items;

      if (!reservationId) {
        res.status(400).json({ success: false, error: "id is required" });
        return;
      }
      if (!branchId) {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }
      if (!items) {
        res.status(400).json({ success: false, error: "items is required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      // Ensure branch belongs to resolved organization (do NOT reuse middleware here;
      // it may terminate the response without calling next(), which can deadlock an await.)
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, organizationId: true },
      });

      if (!branch || branch.organizationId !== organizationId) {
        res.status(403).json({ success: false, error: "Access denied for this branch" });
        return;
      }

      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          branchId: true,
          status: true,
          reservationNumber: true,
          reservationDate: true,
          numberOfGuests: true,
          customerName: true,
        },
      });

      if (!reservation) {
        res.status(404).json({ success: false, error: "Reservation not found" });
        return;
      }

      if (String(reservation.branchId) !== String(branchId)) {
        res.status(400).json({ success: false, error: "Reservation does not belong to this branch" });
        return;
      }

      const statusRaw = String((reservation as any)?.status || "").trim().toUpperCase();
      if (statusRaw !== "CONFIRMED") {
        res.status(400).json({ success: false, error: "Reservation must be CONFIRMED before submitting to kitchen" });
        return;
      }

      const createdByUserId = (req as any)?.rbacUser?.id || null;

      const payload = {
        source: "waiter_submit",
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        customerName: reservation.customerName,
        guests: reservation.numberOfGuests,
        reservationDate: reservation.reservationDate,
        items,
      };

      const ticket = await (prisma as any).kitchenTicket.create({
        data: {
          branchId,
          reservationId: reservation.id,
          items: payload,
          createdByUserId,
          status: "NEW" as any,
        },
      });

      try {
        const ws = WebSocketService.getInstance();
        ws.emitKitchenTicketCreated(ticket);
      } catch (emitErr) {
        console.error("Failed to emit kitchen-ticket-created:", emitErr);
      }

      res.status(201).json({ success: true, data: ticket });
    } catch (error: any) {
      console.error("waiter kitchen-submit error:", error);
      res.status(500).json({ success: false, error: "Failed to submit to kitchen" });
    }
  }
);

router.patch(
  "/:id/status",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  (req, res, next) => {
    const status = (req as any).body?.status;

    if (status === "CONFIRMED") {
      return rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.CONFIRM)(
        req as any,
        res as any,
        next
      );
    }

    if (status === "SEATED") {
      return rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.SEAT)(
        req as any,
        res as any,
        next
      );
    }

    if (status === "COMPLETED") {
      return rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.COMPLETE)(
        req as any,
        res as any,
        next
      );
    }

    return rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.UPDATE)(
      req as any,
      res as any,
      next
    );
  },
  reservationController.updateReservationStatus
);

router.patch(
  "/:id/complete-payment",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.UPDATE),
  reservationController.completeReservationPayment
);

router.patch(
  "/:id/assign-table",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.SEAT),
  reservationController.assignTable
);

router.patch(
  "/:id/cancel",
  authMiddleware.requireAuth,
  (req, res, next) => {
    // Customers cancelling their own reservations should continue to work.
    if ((req as any).user?.userType === "USER") {
      return next();
    }
    return rbac.authenticate(req as any, res as any, next);
  },
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.CANCEL),
  reservationController.cancelReservation
);

router.get(
  "/:id/order",
  authMiddleware.requireAuth,
  reservationController.getReservationOrder
);

router.get(
  "/:id/history",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.RESERVATIONS, ACTIONS.VIEW_HISTORY),
  reservationController.getReservationHistory
);

// Modify reservation endpoint
router.patch(
  "/:id/modify",
  authMiddleware.requireAuth,
  reservationController.modifyReservation
);

export default router;
