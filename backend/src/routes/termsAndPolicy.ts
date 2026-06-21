import { Router } from "express";
import { TermsAndPolicyController } from "../controllers/termsAndPolicyController";
import RBACMiddleware from "../middleware/rbac";

const router = Router();
const termsAndPolicyController = new TermsAndPolicyController();
const rbac = RBACMiddleware.getInstance();

// Public routes - get active policies
router.get("/active", (req, res, next) => {
  next();
}, termsAndPolicyController.getActivePolicy);
router.get("/active/all", termsAndPolicyController.getAllActivePolicies);

// Admin routes
router.use(rbac.authenticate);
router.use(rbac.requireSuperAdmin);

router.get("/", termsAndPolicyController.getAllPolicies);
router.get("/:id", termsAndPolicyController.getPolicyById);
router.get("/:id/consents", termsAndPolicyController.getPolicyConsents);
router.post("/", termsAndPolicyController.createPolicy);
router.put("/:id", termsAndPolicyController.updatePolicy);
router.delete("/:id", termsAndPolicyController.deletePolicy);

export default router;

