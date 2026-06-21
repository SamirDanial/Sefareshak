import express from "express";
import AuthMiddleware from "../middleware/auth";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import { categoryController } from "../controllers/categoryController";

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

// Get all categories with pagination and search
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.CATEGORIES, ACTIONS.VIEW),
  categoryController.getCategories
);

// Get single category by ID
router.get(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.CATEGORIES, ACTIONS.VIEW),
  categoryController.getCategoryById
);

// Create new category
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.CATEGORIES, ACTIONS.CREATE),
  categoryController.createCategory
);

// Update category
router.put(
  "/reorder",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  (req, res, next) => {
    const type = (req as any).body?.type;

    if (type === "featured") {
      return rbac.requirePermission(
        RESOURCES.CATEGORIES,
        ACTIONS.DISPLAY_PRIORITY
      )(req as any, res as any, next);
    }

    if (type === "list") {
      return rbac.requirePermission(RESOURCES.CATEGORIES, ACTIONS.ORDERING)(
        req as any,
        res as any,
        next
      );
    }

    return res.status(400).json({
      success: false,
      message: "Invalid reorder type. Must be 'featured' or 'list'.",
    });
  },
  categoryController.reorderCategories
);

router.put(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.CATEGORIES, ACTIONS.UPDATE),
  categoryController.updateCategory
);

// Delete category
router.delete(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.CATEGORIES, ACTIONS.DELETE),
  categoryController.deleteCategory
);

// Toggle category status
router.patch(
  "/:id/toggle-status",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.CATEGORIES, ACTIONS.TOGGLE_ACTIVE),
  categoryController.toggleCategoryStatus
);

router.patch(
  "/:id/organization",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  categoryController.setCategoryOrganization
);

// SUPER_ADMIN: Copy categories to a different organization (bulk)
router.post(
  "/copy",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  categoryController.copyCategoriesToOrganization
);

export default router;

