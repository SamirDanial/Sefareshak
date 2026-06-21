import { NextFunction, Response } from "express";
import DatabaseSingleton from "../config/database";
import { type RBACRequest } from "./rbac";
import RequestContextService from "../services/requestContext";

export type OrganizationContextRequest = RBACRequest & {
  organizationId?: string;
  organization?: {
    id: string;
    isActive: boolean;
    maxActiveBranches: number | null;
    reservationsAllowed: boolean;
    onlinePaymentsAllowed: boolean;
    cardPaymentsAllowed: boolean;
    paypalAllowed: boolean;
    vouchersAllowed: boolean;
  };
};

const getOrganizationIdFromRequest = (req: OrganizationContextRequest): string | null => {
  const headerVal = req.headers["x-organization-id"];
  if (typeof headerVal === "string" && headerVal.trim()) return headerVal.trim();

  const queryVal = (req.query as any)?.organizationId;
  if (typeof queryVal === "string" && queryVal.trim()) return queryVal.trim();

  return null;
};

export const organizationContext = {
  resolve: async (
    req: OrganizationContextRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
      const rbacUser = req.rbacUser;

      if (!rbacUser) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      if (rbacUser.userType === "SUPER_ADMIN") {
        const requestedOrgId = getOrganizationIdFromRequest(req);

        if (requestedOrgId) {
          const org = await prisma.organization.findUnique({
            where: { id: requestedOrgId },
            select: {
              id: true,
              isActive: true,
              maxActiveBranches: true,
              reservationsAllowed: true,
              onlinePaymentsAllowed: true,
              cardPaymentsAllowed: true,
              paypalAllowed: true,
              vouchersAllowed: true,
            },
          });

          if (!org) {
            res.status(400).json({
              success: false,
              message: "Invalid organizationId",
            });
            return;
          }

          req.organizationId = org.id;
          req.organization = {
            id: org.id,
            isActive: Boolean(org.isActive),
            maxActiveBranches:
              org.maxActiveBranches !== null && org.maxActiveBranches !== undefined
                ? Number(org.maxActiveBranches)
                : null,
            reservationsAllowed: Boolean(org.reservationsAllowed),
            onlinePaymentsAllowed: Boolean(org.onlinePaymentsAllowed),
            cardPaymentsAllowed: Boolean(org.cardPaymentsAllowed),
            paypalAllowed: Boolean(org.paypalAllowed),
            vouchersAllowed: Boolean(org.vouchersAllowed),
          };

          RequestContextService.updateContext({ organizationId: org.id });
          next();
          return;
        }

        // No org selected for SUPER_ADMIN: allow request to continue unscoped.
        // Org-scoped endpoints must explicitly require organizationId.
        next();
        return;
      }

      const userOrgId = (rbacUser as any).organizationId as string | null | undefined;
      if (!userOrgId) {
        res.status(403).json({
          success: false,
          message: "User is not assigned to an organization",
        });
        return;
      }

      const org = await prisma.organization.findUnique({
        where: { id: userOrgId },
        select: {
          id: true,
          isActive: true,
          maxActiveBranches: true,
          reservationsAllowed: true,
          onlinePaymentsAllowed: true,
          cardPaymentsAllowed: true,
          paypalAllowed: true,
          vouchersAllowed: true,
        },
      });

      if (!org) {
        res.status(403).json({
          success: false,
          message: "User organization is invalid",
        });
        return;
      }

      if (!org.isActive) {
        res.status(403).json({
          success: false,
          message: "Organization is deactivated",
        });
        return;
      }

      req.organizationId = org.id;
      req.organization = {
        id: org.id,
        isActive: Boolean(org.isActive),
        maxActiveBranches:
          org.maxActiveBranches !== null && org.maxActiveBranches !== undefined
            ? Number(org.maxActiveBranches)
            : null,
        reservationsAllowed: Boolean(org.reservationsAllowed),
        onlinePaymentsAllowed: Boolean(org.onlinePaymentsAllowed),
        cardPaymentsAllowed: Boolean(org.cardPaymentsAllowed),
        paypalAllowed: Boolean(org.paypalAllowed),
        vouchersAllowed: Boolean(org.vouchersAllowed),
      };

      RequestContextService.updateContext({ organizationId: org.id });
      next();
    } catch (error) {
      console.error("Organization context resolution failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to resolve organization context",
      });
    }
  },
};
