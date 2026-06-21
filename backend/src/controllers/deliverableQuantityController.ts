import { Request, Response } from "express";
import DatabaseSingleton from "../config/database";
import { deliverableQuantityService, getSizeWeightsWithDetails } from "../services/deliverableQuantityService";

export const deliverableQuantityController = {
  // List meals for a branch (excluding meals explicitly excluded for the branch)
  async getMealsForBranch(req: Request, res: Response) {
    try {
      const { branchId } = req.params;
      const db = DatabaseSingleton.getInstance();

      const meals = await db.getPrisma().meal.findMany({
        where: {
          isActive: true,
          NOT: { excludedBranches: { has: branchId } },
          category: { 
            isActive: true,
            NOT: { excludedBranches: { has: branchId } } 
          },
        },
        include: {
          mealSizes: true,
          category: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      });

      res.json({ success: true, data: meals });
    } catch (error) {
      console.error("Error fetching meals for branch:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch meals for branch",
      });
    }
  },

  // List sizes for a meal and include current weight configuration for the branch
  async getMealSizes(req: Request, res: Response) {
    try {
      const { branchId, mealId } = req.params;
      const db = DatabaseSingleton.getInstance();

      const meal = await db.getPrisma().meal.findUnique({
        where: { id: mealId },
        include: { mealSizes: true },
      });
      if (!meal) {
        res.status(404).json({ success: false, error: "Meal not found" });
        return;
      }

      const weights = await deliverableQuantityService.getMealSizeWeights(
        branchId,
        mealId
      );
      const weightMap = new Map(
        weights.map((w) => [w.mealSizeId, { weight: Number(w.weight), weightId: w.id }])
      );

      const sizes = meal.mealSizes.map((size) => ({
        ...size,
        weight: weightMap.get(size.id)?.weight ?? null,
        weightId: weightMap.get(size.id)?.weightId ?? null,
      }));

      res.json({ success: true, data: { mealId, sizes } });
    } catch (error) {
      console.error("Error fetching meal sizes:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch meal sizes",
      });
    }
  },

  // Create/update weight for a meal size
  async upsertSizeWeight(req: Request, res: Response) {
    try {
      const { branchId, mealId, mealSizeId, weight } = req.body;
      if (!branchId || !mealId || !mealSizeId || weight === undefined) {
        res.status(400).json({
          success: false,
          error: "branchId, mealId, mealSizeId and weight are required",
        });
        return;
      }

      const record = await deliverableQuantityService.upsertMealSizeWeight(
        branchId,
        mealId,
        mealSizeId,
        weight
      );
      res.json({ success: true, data: record });
    } catch (error) {
      console.error("Error upserting size weight:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upsert size weight",
      });
    }
  },

  async deleteSizeWeight(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await deliverableQuantityService.deleteMealSizeWeight(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting size weight:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete size weight",
      });
    }
  },

  // Get daily deliverable limit (no date - applies every day)
  async getDailyDeliverable(req: Request, res: Response) {
    try {
      const { branchId, mealId } = req.params;
      const record = await deliverableQuantityService.getDailyDeliverable(
        branchId,
        mealId
      );
      res.json({ success: true, data: record });
    } catch (error) {
      console.error("Error fetching daily deliverable:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch daily deliverable",
      });
    }
  },

  // Set daily deliverable limit (no date - applies every day)
  async upsertDailyDeliverable(req: Request, res: Response) {
    try {
      const { branchId, mealId, dailyDeliverableWeight } = req.body;
      if (!branchId || !mealId || dailyDeliverableWeight === undefined) {
        res.status(400).json({
          success: false,
          error: "branchId, mealId and dailyDeliverableWeight are required",
        });
        return;
      }
      const record = await deliverableQuantityService.upsertDailyDeliverable(
        branchId,
        mealId,
        dailyDeliverableWeight
      );
      res.json({ success: true, data: record });
    } catch (error) {
      console.error("Error upserting daily deliverable:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upsert daily deliverable",
      });
    }
  },

  // Delete daily deliverable limit
  async deleteDailyDeliverable(req: Request, res: Response) {
    try {
      const { branchId, mealId } = req.params;
      await deliverableQuantityService.deleteDailyDeliverable(branchId, mealId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting daily deliverable:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete daily deliverable",
      });
    }
  },

  // Get available weight for TODAY (admin endpoint)
  async getAvailableWeight(req: Request, res: Response) {
    try {
      const { branchId, mealId } = req.params;
      const availability = await deliverableQuantityService.getAvailableWeight(
        branchId,
        mealId
      );
      res.json({ success: true, data: availability });
    } catch (error) {
      console.error("Error fetching available weight:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch available weight",
      });
    }
  },

  // Public endpoint: Get available weight for TODAY (no auth required)
  // This is used by the frontend to check availability before adding to cart
  async getPublicAvailableWeight(req: Request, res: Response) {
    try {
      const { branchId, mealId } = req.params;
      
      // Validate branch exists and is active
      const db = DatabaseSingleton.getInstance();
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
        select: {
          isActive: true,
          organizationId: true,
          organization: { select: { isActive: true } as any } as any,
        } as any,
      });
      
      if (
        !branch ||
        !branch.isActive ||
        ((branch as any).organizationId && (branch as any).organization?.isActive === false)
      ) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }
      
      // Validate meal exists
      const meal = await db.getPrisma().meal.findUnique({
        where: { id: mealId },
        select: { id: true, name: true },
      });
      
      if (!meal) {
        res.status(404).json({ success: false, error: "Meal not found" });
        return;
      }

      const availability = await deliverableQuantityService.getAvailableWeight(
        branchId,
        mealId
      );

      // Also return size weights for the meal so client can calculate required weight
      const { weightsByType } = await getSizeWeightsWithDetails(branchId, mealId);

      res.json({ 
        success: true, 
        data: {
          mealId: meal.id,
          mealName: meal.name,
          ...availability,
          sizeWeights: weightsByType, // { S: 0.5, M: 0.75, L: 1.0 } etc
        }
      });
    } catch (error) {
      console.error("Error fetching public available weight:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch available weight",
      });
    }
  },

  // Public endpoint: Validate cart items against daily limits
  // Used at checkout to verify all items can be fulfilled
  async validateCart(req: Request, res: Response) {
    try {
      const { branchId, items } = req.body;
      
      if (!branchId || !items || !Array.isArray(items)) {
        res.status(400).json({
          success: false,
          error: "branchId and items array are required",
        });
        return;
      }

      // Validate branch exists and is active
      const db = DatabaseSingleton.getInstance();
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
        select: {
          isActive: true,
          organizationId: true,
          organization: { select: { isActive: true } as any } as any,
        } as any,
      });
      
      if (
        !branch ||
        !branch.isActive ||
        ((branch as any).organizationId && (branch as any).organization?.isActive === false)
      ) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      const validation = await deliverableQuantityService.validateOrderWeight(
        items,
        branchId,
        new Date() // Today
      );

      res.json({
        success: true,
        data: {
          valid: validation.ok,
          errors: validation.failures,
        },
      });
    } catch (error) {
      console.error("Error validating cart:", error);
      res.status(500).json({
        success: false,
        error: "Failed to validate cart",
      });
    }
  },
};
