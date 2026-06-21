import { Request, Response } from "express";
import BranchClickService, { type CreateBranchClickData } from "../services/branchClickService";
import type { ClientInfoRequest } from "../middleware/clientInfo";
import type { RBACRequest } from "../middleware/rbac";
import type { AuthenticatedRequest } from "../types";

export class BranchClickController {
  private static instance: BranchClickController;

  static getInstance(): BranchClickController {
    if (!BranchClickController.instance) {
      BranchClickController.instance = new BranchClickController();
    }
    return BranchClickController.instance;
  }

  /**
   * Record a branch click
   * POST /api/user/branches/:id/click
   */
  public recordBranchClick = async (req: ClientInfoRequest & AuthenticatedRequest & { params: { id: string }, body: { userId?: string | null } }, res: Response) => {
    try {
      const branchId = req.params.id;
      
      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required"
        });
        return;
      }

      // Get user ID from request body (sent by frontend) or from authenticated user as fallback
      const userId = req.body.userId || req.user?.id || null;

      // Get client info
      const userAgent = req.clientInfo?.userAgent || null;
      const ipAddress = req.clientInfo?.ipAddress || null;

      // Record the click
      const click = await BranchClickService.recordBranchClick({
        branchId,
        userId,
        userAgent,
        ipAddress
      });

      res.status(201).json({
        success: true,
        data: {
          id: click.id,
          branchId: click.branchId,
          userId: click.userId,
          clickTime: click.clickTime
        }
      });
    } catch (error) {
      console.error("Error recording branch click:", error);
      
      if (error instanceof Error) {
        if (error.message === 'Branch not found') {
          res.status(404).json({
            success: false,
            error: "Branch not found"
          });
          return;
        }
        if (error.message === 'Branch is not active') {
          res.status(400).json({
            success: false,
            error: "Branch is not active"
          });
          return;
        }
        if (error.message === 'User not found') {
          res.status(404).json({
            success: false,
            error: "User not found"
          });
          return;
        }
        if (error.message === 'User is not active') {
          res.status(400).json({
            success: false,
            error: "User is not active"
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: "Failed to record branch click"
      });
    }
  };

  /**
   * Get branch click statistics
   * GET /api/user/branches/:id/click-stats
   */
  public getBranchClickStats = async (req: ClientInfoRequest & { params: { id: string } }, res: Response) => {
    try {
      const branchId = req.params.id;
      
      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required"
        });
        return;
      }

      const stats = await BranchClickService.getBranchClickStats(branchId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error("Error getting branch click stats:", error);
      
      if (error instanceof Error && error.message === 'Branch not found') {
        res.status(404).json({
          success: false,
          error: "Branch not found"
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to get branch click statistics"
      });
    }
  };

  /**
   * Get recent branch clicks with pagination
   * GET /api/user/branches/:id/clicks?page=1&limit=50
   */
  public getBranchClicks = async (req: ClientInfoRequest & { 
    params: { id: string };
    query: { page?: string; limit?: string };
  }, res: Response) => {
    try {
      const branchId = req.params.id;
      
      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required"
        });
        return;
      }

      const page = parseInt(req.query.page || '1');
      const limit = parseInt(req.query.limit || '50');

      if (isNaN(page) || page < 1) {
        res.status(400).json({
          success: false,
          error: "Page must be a positive integer"
        });
        return;
      }

      if (isNaN(limit) || limit < 1 || limit > 100) {
        res.status(400).json({
          success: false,
          error: "Limit must be between 1 and 100"
        });
        return;
      }

      const result = await BranchClickService.getBranchClicks(branchId, page, limit);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error("Error getting branch clicks:", error);
      
      if (error instanceof Error && error.message === 'Branch not found') {
        res.status(404).json({
          success: false,
          error: "Branch not found"
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to get branch clicks"
      });
    }
  };

  /**
   * Get organization click statistics (admin only)
   * GET /api/admin/organizations/:orgId/click-stats
   */
  public getOrganizationClickStats = async (req: RBACRequest & { params: { orgId: string } }, res: Response) => {
    try {
      const organizationId = req.params.orgId;
      
      if (!organizationId) {
        res.status(400).json({
          success: false,
          error: "Organization ID is required"
        });
        return;
      }

      const stats = await BranchClickService.getOrganizationClickStats(organizationId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error("Error getting organization click stats:", error);

      res.status(500).json({
        success: false,
        error: "Failed to get organization click statistics"
      });
    }
  };
}

export default BranchClickController.getInstance();
