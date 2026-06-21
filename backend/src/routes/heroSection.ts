import { Router } from "express";
import { HeroSectionController } from "../controllers/heroSectionController";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = Router();
const heroSectionController = new HeroSectionController();
const rbac = RBACMiddleware.getInstance();

// Public route - get active hero section
router.get("/active", heroSectionController.getActiveHeroSection);

// Admin routes
router.use(rbac.authenticate);
router.use(organizationContext.resolve);

router.get(
  "/",
  rbac.requirePermission(RESOURCES.HERO_SECTIONS, ACTIONS.VIEW),
  heroSectionController.getAllHeroSections
);
router.get(
  "/:id",
  rbac.requirePermission(RESOURCES.HERO_SECTIONS, ACTIONS.VIEW),
  heroSectionController.getHeroSectionById
);
router.post(
  "/",
  rbac.requirePermission(RESOURCES.HERO_SECTIONS, ACTIONS.UPDATE),
  heroSectionController.createHeroSection
);
router.put(
  "/:id",
  rbac.requirePermission(RESOURCES.HERO_SECTIONS, ACTIONS.UPDATE),
  heroSectionController.updateHeroSection
);
router.delete(
  "/:id",
  rbac.requirePermission(RESOURCES.HERO_SECTIONS, ACTIONS.UPDATE),
  heroSectionController.deleteHeroSection
);

export default router;
