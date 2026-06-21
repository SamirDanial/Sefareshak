import { Router, Response } from "express";
import RBACMiddleware, { type RBACRequest } from "../middleware/rbac";
import { organizationContext, type OrganizationContextRequest } from "../middleware/organizationContext";

const router = Router();
const rbac = RBACMiddleware.getInstance();

router.get(
  "/organization-context/me",
  rbac.authenticate,
  organizationContext.resolve,
  (req: OrganizationContextRequest, res: Response) => {
    res.json({
      success: true,
      data: {
        organizationId: req.organizationId ?? null,
        userType: req.rbacUser?.userType ?? null,
        assignedBranchIds: req.rbacUser?.assignedBranchIds ?? [],
      },
    });
  }
);

export default router;
