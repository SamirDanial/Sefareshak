import express from "express";
import AuthMiddleware from "../middleware/auth";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import { mealController } from "../controllers/mealController";

const router = express.Router();
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

// Get all meals with pagination and search (public route for customers)
router.get("/", mealController.getMeals);

// Get single meal by ID (public route for customers)
router.get("/:id", mealController.getMealById);

// Create new meal
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.CREATE },
    { resource: RESOURCES.MEALS, action: ACTIONS.CREATE },
  ]),
  mealController.createMeal
);

// Reorder featured meals (must appear before /:id routes)
router.put(
  "/reorder-featured",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_FEATURED },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_FEATURED },
  ]),
  mealController.reorderFeaturedMeals
);

router.put(
  "/reorder-category",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_CATEGORY },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_CATEGORY },
  ]),
  mealController.reorderCategoryMeals
);

// Update meal
router.put(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
    { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
  ]),
  mealController.updateMeal
);

// Delete meal
router.delete(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.DELETE },
    { resource: RESOURCES.MEALS, action: ACTIONS.DELETE },
  ]),
  mealController.deleteMeal
);

// Toggle meal status
router.patch(
  "/:id/toggle-status",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.TOGGLE_ACTIVE },
    { resource: RESOURCES.MEALS, action: ACTIONS.TOGGLE_ACTIVE },
  ]),
  mealController.toggleMealStatus
);

export default router;
