/**
 * Permission Routes
 * API endpoints for permission checking and resource discovery
 */

import { Router } from "express";
import RoleController from "../controllers/roleController";
import RBACMiddleware from "../middleware/rbac";

const router = Router();
const roleController = RoleController.getInstance();
const rbac = RBACMiddleware.getInstance();

// GET /api/permissions/resources - Get all available resources and actions
router.get(
  "/resources",
  rbac.authenticate,
  roleController.getResources
);

// GET /api/permissions/me - Get current user's permissions
router.get(
  "/me",
  rbac.authenticate,
  roleController.getMyPermissions
);

// POST /api/permissions/check - Check if user has a specific permission
router.post(
  "/check",
  rbac.authenticate,
  roleController.checkPermission
);

export default router;
