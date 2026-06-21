import { Request, Response } from "express";
import DatabaseSingleton from "../config/database";
import BranchService from "../services/branchService";
import type { RBACRequest } from "../middleware/rbac";
import { hasImplicitFullAccess } from "../config/permissions";
import type { OrganizationContextRequest } from "../middleware/organizationContext";
import { AuditLogService } from "../services/auditLogService";
import { FiskalyService } from "../services/fiskalyService";
import DsfinvkService from "../services/dsfinvkService";
import { calculateDistance } from "../utils/distanceCalculator";
import { v4 as uuidv4 } from "uuid";

const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export class BranchController {
  private db = DatabaseSingleton.getInstance();

  public getOrganizationById = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const organization = await this.db.getPrisma().organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          organizationNumber: true,
          isActive: true,
          isValidated: true,
          validatedAt: true,
          validatedBy: true,
          validationExpiresAt: true,
          validationNotes: true,
          gracePeriodEndsAt: true,
          maxActiveBranches: true,
          freeVersion: true,
          reservationsAllowed: true,
          onlinePaymentsAllowed: true,
          cardPaymentsAllowed: true,
          paypalAllowed: true,
          vouchersAllowed: true,
        },
      });

      if (!organization) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      res.json({ success: true, data: organization });
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ success: false, error: "Failed to fetch organization" });
    }
  };

  private removeBranchIdFromExcludedBranches = async (
    tx: any,
    organizationId: string,
    branchId: string
  ) => {
    const prisma = tx as any;

    const [categories, meals, deals, addons] = await Promise.all([
      prisma.category.findMany({
        where: { organizationId, excludedBranches: { has: branchId } },
        select: { id: true, excludedBranches: true },
      }),
      prisma.meal.findMany({
        where: { organizationId, excludedBranches: { has: branchId } },
        select: { id: true, excludedBranches: true },
      }),
      prisma.deal.findMany({
        where: { organizationId, excludedBranches: { has: branchId } },
        select: { id: true, excludedBranches: true },
      }),
      prisma.addOn.findMany({
        where: { organizationId, excludedBranches: { has: branchId } },
        select: { id: true, excludedBranches: true },
      }),
    ]);

    const updates: any[] = [];

    for (const c of categories) {
      updates.push(
        prisma.category.update({
          where: { id: c.id },
          data: {
            excludedBranches: (c.excludedBranches || []).filter((b: string) => b !== branchId),
          },
        })
      );
    }

    for (const m of meals) {
      updates.push(
        prisma.meal.update({
          where: { id: m.id },
          data: {
            excludedBranches: (m.excludedBranches || []).filter((b: string) => b !== branchId),
          },
        })
      );
    }

    for (const d of deals) {
      updates.push(
        prisma.deal.update({
          where: { id: d.id },
          data: {
            excludedBranches: (d.excludedBranches || []).filter((b: string) => b !== branchId),
          },
        })
      );
    }

    for (const a of addons) {
      updates.push(
        prisma.addOn.update({
          where: { id: a.id },
          data: {
            excludedBranches: (a.excludedBranches || []).filter((b: string) => b !== branchId),
          },
        })
      );
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }
  };

  // Admin: list branches
  public getBranches = async (req: OrganizationContextRequest, res: Response) => {
    try {
      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const orgRole = (req.rbacUser as any)?.orgRole as string | null | undefined;
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      const organizationId = req.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const now = new Date();

      // Validation filter: only apply for non-super-admin users
      // Super admins need to see branches for unvalidated organizations to manage them
      const validOrganizationWhere = !isSuperAdmin
        ? {
            isActive: true,
            isValidated: true,
            OR: [
              {
                validationExpiresAt: { gt: now },
              },
              {
                validations: {
                  some: {
                    isActive: true,
                    expiresAt: { gt: now },
                  } as any,
                } as any,
              },
            ],
          }
        : {
            isActive: true,
          };


      // Non-super-admin views are scoped to assigned branches
      // Org admins can view all branches within their organization.
      const where = !isSuperAdmin && !isOrgAdmin
        ? {
            id: { in: req.rbacUser?.assignedBranchIds || [] },
            organizationId,
            organization: {
              ...(validOrganizationWhere as any),
            } as any,
          }
        : {
            organizationId,
            organization: {
              ...(validOrganizationWhere as any),
            } as any,
          };

      const branches = await this.db.getPrisma().branch.findMany({
        where,
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          city: true,
          state: true,
          country: true,
          latitude: true,
          longitude: true,
          isActive: true,
          isUrgentlyClosed: true,
          urgentCloseMessage: true,
          urgentClosedAt: true,
          urgentClosedByUserId: true,
          organizationId: true,
          createdAt: true,
          updatedAt: true,
          // Financial / Tax Settings
          deliveryFee: true,
          taxPercentage: true,
          serviceTaxPercentage: true,
          deliveryTaxPercentage: true,
          taxInclusive: true,
          currency: true,
          enableMinimumOrder: true,
          minimumOrderAmount: true,
          pickupTakeawayServiceFee: true,
          pickupEnabled: true,
          deliveryEnabled: true,
          // Payment Settings
          acceptCash: true,
          acceptCard: true,
          acceptOnlinePayment: true,
          pickupAcceptCash: true,
          pickupAcceptCard: true,
          pickupAcceptOnlinePayment: true,
          pickupAcceptPayPal: true,
          organization: {
            select: {
              id: true,
              maxActiveBranches: true,
              freeVersion: true,
              reservationsAllowed: true,
              onlinePaymentsAllowed: true,
              cardPaymentsAllowed: true,
              paypalAllowed: true,
              vouchersAllowed: true,
            } as any,
          } as any,
        } as any,
      });


      res.json({ success: true, data: branches });
    } catch (error) {
      console.error("Error fetching branches:", error);
      res.status(500).json({ success: false, error: "Failed to fetch branches" });
    }
  };

  public getOrganizationReservationSettings = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      const prisma = this.db.getPrisma();
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, reservationsAllowed: true },
      });

      if (!organization) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      if (!isSuperAdmin && (organization as any).reservationsAllowed === false) {
        res.status(403).json({
          success: false,
          error: "Reservations are disabled for this organization",
        });
        return;
      }

      const settings = await (prisma as any).reservationSettings.findUnique({
        where: { organizationId },
      });

      // Read-only endpoint: do not create rows on GET.
      // Org-specific ReservationSettings should be created on org creation or explicit upsert.
      res.json({ success: true, data: settings || null });
    } catch (error) {
      console.error("Error fetching organization reservation settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch organization reservation settings",
      });
    }
  };

  public upsertOrganizationReservationSettings = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      const prisma = this.db.getPrisma();
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });

      if (!organization) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      const body = (req.body || {}) as any;
      const data: any = { ...body };

      delete data.id;
      delete data.createdAt;
      delete data.updatedAt;
      delete data.organizationId;
      delete data.organization;

      if (data.tier && !["SIMPLE", "MEDIUM", "COMPLEX"].includes(String(data.tier))) {
        data.tier = "SIMPLE";
      }

      const settings = await (prisma as any).reservationSettings.upsert({
        where: { organizationId },
        create: { organizationId, ...data } as any,
        update: data,
      });

      res.json({ success: true, data: settings });
    } catch (error) {
      console.error("Error upserting organization reservation settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update organization reservation settings",
      });
    }
  };

  public updateOrganization = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const prisma = this.db.getPrisma();
      const existing = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!existing) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      const body = (req.body || {}) as any;
      const data: any = {};

      // Prevent modification of organizationNumber (immutable field)
      if (body.organizationNumber !== undefined) {
        res.status(400).json({
          success: false,
          error: "organizationNumber cannot be modified",
        });
        return;
      }

      if (body.name !== undefined) {
        if (typeof body.name !== "string" || body.name.trim().length === 0) {
          res.status(400).json({ success: false, error: "name is required" });
          return;
        }
        data.name = body.name.trim();
      }

      if (body.isActive !== undefined) {
        data.isActive = Boolean(body.isActive);
      }

      if (body.maxActiveBranches !== undefined) {
        if (body.maxActiveBranches === null || body.maxActiveBranches === "") {
          data.maxActiveBranches = null;
        } else {
          const parsed = Number(body.maxActiveBranches);
          if (!Number.isFinite(parsed) || parsed < 0) {
            res.status(400).json({
              success: false,
              error: "maxActiveBranches must be a non-negative number or null",
            });
            return;
          }
          
          // Check if organization is in free version mode and limit to 1
          if (existing.freeVersion === true && parsed > 1) {
            res.status(400).json({
              success: false,
              error: "Maximum active branches cannot exceed 1 in free version",
            });
            return;
          }
          
          data.maxActiveBranches = Math.floor(parsed);
        }
      }

      if (body.freeVersion !== undefined) {
        data.freeVersion = Boolean(body.freeVersion);
        
        // When freeVersion is enabled, automatically disable all paid features and limit branches to 1
        if (data.freeVersion === true) {
          data.reservationsAllowed = false;
          data.onlinePaymentsAllowed = false;
          data.cardPaymentsAllowed = false;
          data.paypalAllowed = false;
          data.vouchersAllowed = false;
          data.maxActiveBranches = 1;
        }
      }

      // Only allow updating these fields if freeVersion is not being set to true
      if (data.freeVersion !== true) {
        if (body.reservationsAllowed !== undefined) {
          data.reservationsAllowed = Boolean(body.reservationsAllowed);
        }

        if (body.onlinePaymentsAllowed !== undefined) {
          data.onlinePaymentsAllowed = Boolean(body.onlinePaymentsAllowed);
        }

        if (body.cardPaymentsAllowed !== undefined) {
          data.cardPaymentsAllowed = Boolean(body.cardPaymentsAllowed);
        }

        if (body.paypalAllowed !== undefined) {
          data.paypalAllowed = Boolean(body.paypalAllowed);
        }

        if (body.vouchersAllowed !== undefined) {
          data.vouchersAllowed = Boolean(body.vouchersAllowed);
        }
      }


      const updated = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.update({
          where: { id: organizationId },
          data,
          select: {
            id: true,
            isActive: true,
            maxActiveBranches: true,
            freeVersion: true,
            reservationsAllowed: true,
            onlinePaymentsAllowed: true,
            cardPaymentsAllowed: true,
            paypalAllowed: true,
            vouchersAllowed: true,
          },
        });


        if (org.reservationsAllowed === false) {
          await (tx as any).reservationSettings.updateMany({
            where: { organizationId } as any,
            data: { isEnabled: false } as any,
          });

          await tx.branch.updateMany({
            where: { organizationId } as any,
            data: { reservationIsEnabled: false } as any,
          });
        }

        // Online payment entitlement cascade: when an entitlement is removed, force-disable
        // corresponding branch-level payment toggles for BOTH delivery and pickup.
        if (org.onlinePaymentsAllowed === false) {
          await tx.branch.updateMany({
            where: { organizationId } as any,
            data: {
              acceptOnlinePayment: false,
              acceptCard: false,
              acceptPayPal: false,
              pickupAcceptOnlinePayment: false,
              pickupAcceptCard: false,
              pickupAcceptPayPal: false,
            } as any,
          });
        } else {
          if (org.cardPaymentsAllowed === false) {
            await tx.branch.updateMany({
              where: { organizationId } as any,
              data: {
                acceptCard: false,
                pickupAcceptCard: false,
              } as any,
            });
          }
          if (org.paypalAllowed === false) {
            await tx.branch.updateMany({
              where: { organizationId } as any,
              data: {
                acceptPayPal: false,
                pickupAcceptPayPal: false,
              } as any,
            });
          }
        }

        const limit =
          org.maxActiveBranches !== null && org.maxActiveBranches !== undefined
            ? Number(org.maxActiveBranches)
            : null;

        if (limit !== null && Number.isFinite(limit)) {
          const activeBranches = await tx.branch.findMany({
            where: { organizationId, isActive: true } as any,
            select: { id: true, createdAt: true } as any,
            orderBy: [{ createdAt: "asc" }] as any,
          });

          if (activeBranches.length > limit) {
            const toDeactivate = activeBranches
              .slice(limit)
              .map((b) => String((b as any).id));

            await tx.branch.updateMany({
              where: { id: { in: toDeactivate } } as any,
              data: { isActive: false } as any,
            });

            console.info(
              `[Entitlements] Organization ${organizationId}: maxActiveBranches=${limit}; deactivated ${toDeactivate.length} branch(es): ${toDeactivate.join(
                ","
              )}`
            );
          }
        }

        return org;
      });

      await AuditLogService.writeSafe({
        action: "ORG_UPDATE",
        entityType: "Organization",
        entityId: organizationId,
        scope: { organizationId },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existing,
        after: updated,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Error updating organization:", error);

      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Unknown argument `isActive`") ||
        message.includes("Unknown argument isActive")
      ) {
        res.status(500).json({
          success: false,
          error:
            "Organization.isActive is not available in the current Prisma client/schema. Run Prisma migration (or db push) and prisma generate, then restart the backend.",
        });
        return;
      }

      res.status(500).json({ success: false, error: "Failed to update organization" });
    }
  };

  public getOrganizationSettings = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      const prisma = this.db.getPrisma();
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });

      if (!organization) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      const settings = await (prisma as any).settings.findUnique({
        where: { organizationId },
      });

      // Read-only endpoint: do not create rows on GET.
      // Org-specific Settings should be created on org creation or explicit upsert.
      res.json({ success: true, data: settings || null });
    } catch (error) {
      console.error("Error fetching organization settings:", error);
      res.status(500).json({ success: false, error: "Failed to fetch organization settings" });
    }
  };

  public upsertOrganizationSettings = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      const prisma = this.db.getPrisma();
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });

      if (!organization) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      const body = (req.body || {}) as any;
      const data: any = { ...body };

      // Never allow client to override immutable/system fields
      delete data.id;
      delete data.createdAt;
      delete data.updatedAt;
      delete data.organizationId;
      delete data.organization;

      // Treat empty-string values as "not provided" to avoid type issues.
      for (const [key, value] of Object.entries(data)) {
        if (value === "") {
          delete (data as any)[key];
        }
      }

      const fiskalyEnabled =
        data.fiskalyEnabled === undefined ? undefined : Boolean(data.fiskalyEnabled);
      const fiskalyEnvironmentRaw =
        data.fiskalyEnvironment === undefined ? undefined : String(data.fiskalyEnvironment);
      const fiskalyEnvironment = fiskalyEnvironmentRaw
        ? fiskalyEnvironmentRaw.toUpperCase()
        : undefined;

      if (fiskalyEnabled === true && fiskalyEnvironment === "LIVE") {
        const fiskalyApiBaseUrl = data.fiskalyApiBaseUrl
          ? String(data.fiskalyApiBaseUrl).trim()
          : "";
        const fiskalyClientId = data.fiskalyClientId
          ? String(data.fiskalyClientId).trim()
          : "";
        const fiskalyClientSecret = data.fiskalyClientSecret
          ? String(data.fiskalyClientSecret).trim()
          : "";

        if (!fiskalyApiBaseUrl || !fiskalyClientId || !fiskalyClientSecret) {
          res.status(400).json({
            success: false,
            error:
              "When fiskalyEnabled=true and fiskalyEnvironment=LIVE, fiskalyApiBaseUrl, fiskalyClientId, and fiskalyClientSecret are required",
          });
          return;
        }

        if (!/^https?:\/\//i.test(fiskalyApiBaseUrl)) {
          res.status(400).json({
            success: false,
            error: "fiskalyApiBaseUrl must start with http:// or https://",
          });
          return;
        }

        data.fiskalyApiBaseUrl = fiskalyApiBaseUrl;
        data.fiskalyClientId = fiskalyClientId;
        data.fiskalyClientSecret = fiskalyClientSecret;
      }

      const settings = await (prisma as any).settings.upsert({
        where: { organizationId },
        create: { organizationId, ...data } as any,
        update: data,
      });

      // Provision organization-level TSS on save (synchronous) so user gets immediate feedback.
      // Client provisioning is handled per POS device.
      const fiskalyEnabledNext =
        data.fiskalyEnabled === undefined
          ? Boolean((settings as any)?.fiskalyEnabled)
          : Boolean(data.fiskalyEnabled);
      const fiskalyEnvNext =
        data.fiskalyEnvironment === undefined
          ? String((settings as any)?.fiskalyEnvironment || "").toUpperCase()
          : String(data.fiskalyEnvironment).toUpperCase();

      if (fiskalyEnabledNext === true && fiskalyEnvNext === "LIVE") {
        try {
          await FiskalyService.getInstance().provisionOrganizationTss({
            organizationId,
          });
        } catch (e: any) {
          const message = e instanceof Error ? e.message : String(e);
          const updatedSettings = await (prisma as any).settings.findUnique({
            where: { organizationId },
          });
          res.status(400).json({
            success: false,
            error: message,
            data: updatedSettings || settings,
          });
          return;
        }
      }

      // Push tax/fiscal data to all provisioned Fiskaly cash registers for DSFinV-K.
      // STNR and USTID in cashpointclosing.csv come from the cash_register record,
      // not from the organization record. So we upsert each provisioned POS device's
      // cash register with the latest tax data whenever settings are saved.
      const hasTaxOrFiscalData =
        data.taxNumber !== undefined ||
        data.vatId !== undefined ||
        data.fiscalName !== undefined ||
        data.fiscalStreet !== undefined ||
        data.fiscalZip !== undefined ||
        data.fiscalCity !== undefined ||
        data.fiscalCountry !== undefined;

      if (hasTaxOrFiscalData && fiskalyEnabledNext === true) {
        try {
          const dsfinvk = DsfinvkService.getInstance();
          const token = await dsfinvk.getToken({ internalOrganizationId: organizationId });

          // Fetch all provisioned POS devices for this organization
          const provisionedDevices = await (prisma as any).posDevice.findMany({
            where: {
              organizationId,
              fiskalyClientId: { not: null },
              isDeleted: { not: true },
            },
            select: {
              id: true,
              name: true,
              fiskalyClientId: true,
              fiskalyClientSerialNumber: true,
            },
          });

          const finalSettingsForFiskaly = await (prisma as any).settings.findUnique({
            where: { organizationId },
            select: {
              fiskalyTssId: true,
              taxNumber: true,
              vatId: true,
              fiscalName: true,
              fiscalStreet: true,
              fiscalZip: true,
              fiscalCity: true,
              fiscalCountry: true,
              businessName: true,
            },
          });

          for (const device of provisionedDevices) {
            const cashRegisterId = String(device.fiskalyClientId || "").trim();
            if (!cashRegisterId) continue;
            try {
              await dsfinvk.insertCashRegister({
                internalOrganizationId: organizationId,
                fiskalyOrganizationId: "",
                cashRegisterId,
                cashRegisterExportId: cashRegisterId,
                brand: finalSettingsForFiskaly?.fiscalName || finalSettingsForFiskaly?.businessName || null,
                model: device.name || "pos",
                softwareBrand: "Next Foody",
                token,
              });
              console.info(`[DSFinV-K] Updated cash register ${cashRegisterId} with latest tax/fiscal data`);
            } catch (devErr: any) {
              console.warn(`[DSFinV-K] Failed to update cash register ${cashRegisterId}:`, devErr?.message || devErr);
            }
          }
        } catch (e: any) {
          // Log but don't fail the request - settings are already saved
          console.warn("[DSFinV-K] Failed to push tax data to Fiskaly cash registers:", e?.message || e);
        }
      }

      const finalSettings = await (prisma as any).settings.findUnique({
        where: { organizationId },
      });
      res.json({ success: true, data: finalSettings || settings });
    } catch (error) {
      console.error("Error upserting organization settings:", error);

      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Unknown argument `organizationId`") ||
        message.includes("Unknown argument organizationId")
      ) {
        res.status(500).json({
          success: false,
          error:
            "Prisma client/schema mismatch: Settings.organizationId is not available. Run Prisma migration (or db push) and prisma generate, then restart the backend.",
        });
        return;
      }
      res.status(500).json({ success: false, error: "Failed to update organization settings" });
    }
  };

  public listOrganizationPosDevices = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;
      const branchIdRaw = (req.query.branchId as string | undefined) ?? undefined;
      const branchId = branchIdRaw ? String(branchIdRaw).trim() : "";

      if (branchId) {
        const branch = await prisma.branch.findFirst({
          where: { id: branchId, organizationId },
          select: { id: true },
        });
        if (!branch) {
          res.status(400).json({ success: false, error: "Invalid branchId" });
          return;
        }
      }

      const devices = await prisma.posDevice.findMany({
        where: {
          organizationId,
          ...(branchId ? { branchId } : {}),
          isDeleted: false, // Exclude deleted devices
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          organizationId: true,
          branchId: true,
          name: true,
          deviceCode: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          fiskalyClientId: true,
          fiskalyClientSerialNumber: true,
          fiskalyClientProvisioningStatus: true,
          fiskalyClientProvisioningLastErrorCode: true,
          fiskalyClientProvisioningLastErrorMessage: true,
        },
      });

      res.json({ success: true, data: devices });
    } catch (error) {
      console.error("Error listing POS devices:", error);
      res.status(500).json({ success: false, error: "Failed to fetch POS devices" });
    }
  };

  public createOrganizationPosDevice = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const body = (req.body || {}) as any;
      const branchId = body.branchId ? String(body.branchId).trim() : "";
      const name = body.name ? String(body.name).trim() : "";
      const deviceCode = body.deviceCode ? String(body.deviceCode).trim() : "";
      const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

      if (!branchId || !name || !deviceCode) {
        res.status(400).json({
          success: false,
          error: "branchId, name, and deviceCode are required",
        });
        return;
      }

      const prisma = this.db.getPrisma() as any;
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, organizationId },
        select: { id: true },
      });
      if (!branch) {
        res.status(400).json({ success: false, error: "Invalid branchId" });
        return;
      }

      // If creating an active device, ensure org Fiskaly is provisioned and LIVE
      if (isActive) {
        const orgSettings = await prisma.settings.findFirst({
          where: { organizationId },
          select: {
            fiskalyEnabled: true,
            fiskalyEnvironment: true,
            fiskalyProvisioningStatus: true,
          },
        });
        if (
          !orgSettings?.fiskalyEnabled ||
          orgSettings.fiskalyEnvironment !== "LIVE" ||
          orgSettings.fiskalyProvisioningStatus !== "READY"
        ) {
          res.status(400).json({
            success: false,
            error:
              "Device cannot be active because organization Fiskaly is not provisioned. Please configure Fiskaly in Organization Settings first.",
          });
          return;
        }
      }

      const created = await prisma.posDevice.create({
        data: {
          organizationId,
          branchId,
          name,
          deviceCode,
          isActive,
        },
      });

      res.status(201).json({ success: true, data: created });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unique constraint") || error?.code === "P2002") {
        res.status(409).json({ success: false, error: "deviceCode must be unique" });
        return;
      }
      console.error("Error creating POS device:", error);
      res.status(500).json({ success: false, error: "Failed to create POS device" });
    }
  };

  public updateOrganizationPosDevice = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      const deviceId = req.params.deviceId;
      if (!organizationId || !deviceId) {
        res.status(400).json({ success: false, error: "organizationId and deviceId are required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;
      const existing = await prisma.posDevice.findFirst({
        where: { id: deviceId, organizationId },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: "POS device not found" });
        return;
      }

      const body = (req.body || {}) as any;
      const data: any = { ...body };
      delete data.id;
      delete data.organizationId;
      delete data.createdAt;
      delete data.updatedAt;
      delete data.organization;
      delete data.branch;
      delete data.fiscalTransactions;

      if (data.branchId) {
        const branchId = String(data.branchId).trim();
        const branch = await prisma.branch.findFirst({
          where: { id: branchId, organizationId },
          select: { id: true },
        });
        if (!branch) {
          res.status(400).json({ success: false, error: "Invalid branchId" });
          return;
        }
        data.branchId = branchId;
      }

      if (data.name !== undefined) data.name = String(data.name).trim();
      if (data.deviceCode !== undefined) data.deviceCode = String(data.deviceCode).trim();

      // If setting isActive=true, ensure org Fiskaly is provisioned and LIVE
      if (data.isActive === true && existing.isActive !== true) {
        const orgSettings = await prisma.settings.findFirst({
          where: { organizationId },
          select: {
            fiskalyEnabled: true,
            fiskalyEnvironment: true,
            fiskalyProvisioningStatus: true,
          },
        });
        if (
          !orgSettings?.fiskalyEnabled ||
          orgSettings.fiskalyEnvironment !== "LIVE" ||
          orgSettings.fiskalyProvisioningStatus !== "READY"
        ) {
          res.status(400).json({
            success: false,
            error:
              "Device cannot be active because organization Fiskaly is not provisioned. Please configure Fiskaly in Organization Settings first.",
          });
          return;
        }
      }

      // If setting isActive=false and device is provisioned, deprovision it
      if (data.isActive === false && existing.isActive === true && existing.fiskalyClientId) {
        try {
          // Attempt to deprovision the Fiskaly client (non-blocking)
          FiskalyService.getInstance()
            .deprovisionPosDeviceClient({
              organizationId,
              deviceId,
            })
            .catch((e) => {
              console.warn(
                "Fiskaly POS device client deprovisioning failed (non-blocking):",
                e
              );
            });

          // Clear Fiskaly client fields from database
          await prisma.posDevice.update({
            where: { id: deviceId },
            data: {
              fiskalyClientId: null,
              fiskalyClientSerialNumber: null,
              fiskalyClientProvisioningStatus: null,
              fiskalyClientProvisioningLastErrorCode: null,
              fiskalyClientProvisioningLastErrorMessage: null,
            },
          });
        } catch (e: any) {
          console.warn("Failed to clear Fiskaly client data during deactivation:", e);
          // Continue with deactivation even if deprovisioning fails
        }
      }

      const updated = await prisma.posDevice.update({
        where: { id: deviceId },
        data,
      });

      res.json({ success: true, data: updated });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unique constraint") || error?.code === "P2002") {
        res.status(409).json({ success: false, error: "deviceCode must be unique" });
        return;
      }
      console.error("Error updating POS device:", error);
      res.status(500).json({ success: false, error: "Failed to update POS device" });
    }
  };

  public deleteOrganizationPosDevice = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      const deviceId = req.params.deviceId;
      const deletionReason = req.body?.reason || "User requested deletion";
      
      if (!organizationId || !deviceId) {
        res.status(400).json({ success: false, error: "organizationId and deviceId are required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;
      const device = await prisma.posDevice.findFirst({
        where: { id: deviceId, organizationId },
      });
      if (!device) {
        res.status(404).json({ success: false, error: "POS device not found" });
        return;
      }

      if (device.isDeleted) {
        res.status(400).json({ success: false, error: "POS device is already deleted" });
        return;
      }

      const fiskalyService = FiskalyService.getInstance();
      let deletionResult: {
        type: "full" | "soft";
        fiskalyDeprovisioned: boolean;
        message: string;
        warnings?: string[];
      };

      // Stage 1: Check if device has Fiskaly client
      if (device.fiskalyClientId) {
        console.info(`Device ${deviceId} has Fiskaly client ${device.fiskalyClientId}, checking transaction status...`);

        try {
          // Stage 2: Check if client has transactions
          const hasTransactions = await fiskalyService.checkClientHasTransactions({
            organizationId,
            clientId: device.fiskalyClientId,
          });

          if (hasTransactions) {
            // Stage 3a: Client has transactions - soft delete with warning
            console.info(`Fiskaly client ${device.fiskalyClientId} has transactions, performing soft delete`);

            // Attempt to deprovision anyway (will likely fail but try)
            let deprovisioned = false;
            try {
              await fiskalyService.deprovisionPosDeviceClient({
                organizationId,
                deviceId,
              });
              deprovisioned = true;
              console.info(`Successfully deprovisioned Fiskaly client ${device.fiskalyClientId} despite having transactions`);
            } catch (deprovErr: any) {
              console.info(`Expected: Could not deprovision Fiskaly client due to existing transactions`);
            }

            // Soft delete the device
            await prisma.posDevice.update({
              where: { id: deviceId },
              data: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.rbacUser?.id || null,
                deletionReason,
                fiskalyDeprovisioned: deprovisioned,
                isActive: false, // Also deactivate when deleting
                // Clear Fiskaly fields to avoid confusion
                fiskalyClientId: null,
                fiskalyClientSerialNumber: null,
                fiskalyClientProvisioningStatus: null,
                fiskalyClientProvisioningLastErrorCode: null,
                fiskalyClientProvisioningLastErrorMessage: null,
              },
            });

            deletionResult = {
              type: "soft",
              fiskalyDeprovisioned: deprovisioned,
              message: "Device deleted but retained due to existing fiscal transactions (Fiskaly fields cleared)",
              warnings: deprovisioned ? [] : [
                "Fiskaly client could not be deleted because it has existing fiscal transactions",
                "The client will continue to consume licenses until transactions are archived",
                "Contact Fiskaly support for manual cleanup if needed"
              ],
            };

          } else {
            // Stage 3b: Client has no transactions - soft delete with Fiskaly cleanup
            console.info(`Fiskaly client ${device.fiskalyClientId} has no transactions, performing soft delete with Fiskaly cleanup`);

            try {
              // Deprovision the Fiskaly client
              await fiskalyService.deprovisionPosDeviceClient({
                organizationId,
                deviceId,
              });
              console.info(`Successfully deprovisioned Fiskaly client ${device.fiskalyClientId}`);

              // Soft delete the device (keep for audit)
              await prisma.posDevice.update({
                where: { id: deviceId },
                data: {
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedBy: req.rbacUser?.id || null,
                  deletionReason: deletionReason + " (no transactions)",
                  fiskalyDeprovisioned: true,
                  isActive: false,
                  // Clear Fiskaly fields to avoid confusion
                  fiskalyClientId: null,
                  fiskalyClientSerialNumber: null,
                  fiskalyClientProvisioningStatus: null,
                  fiskalyClientProvisioningLastErrorCode: null,
                  fiskalyClientProvisioningLastErrorMessage: null,
                },
              });

              deletionResult = {
                type: "soft",
                fiskalyDeprovisioned: true,
                message: "Device deleted successfully (Fiskaly client deprovisioned)",
              };

            } catch (deprovErr: any) {
              console.warn(`Failed to deprovision Fiskaly client, falling back to soft delete:`, deprovErr);

              // Fallback to soft delete if deprovisioning fails
              await prisma.posDevice.update({
                where: { id: deviceId },
                data: {
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedBy: req.rbacUser?.id || null,
                  deletionReason: deletionReason + " (Fiskaly deprovisioning failed)",
                  fiskalyDeprovisioned: false,
                  isActive: false,
                },
              });

              deletionResult = {
                type: "soft",
                fiskalyDeprovisioned: false,
                message: "Device deleted but Fiskaly client cleanup failed",
                warnings: [
                  "Failed to deprovision Fiskaly client: " + (deprovErr?.message || "Unknown error"),
                  "The client may still be active in Fiskaly system",
                  "Manual cleanup may be required"
                ],
              };
            }
          }

        } catch (err: any) {
          console.warn("Failed to check client transactions:", err);
          // If client doesn't exist (404), it has no transactions and we can do full delete
          if (err?.fiskalyCode === 'E_NOT_FOUND' || err?.httpStatus === 404) {
            console.info(`Fiskaly client ${device.fiskalyClientId} not found, performing full delete (no client exists)`);
            
            // Client doesn't exist, so we can do soft delete without deprovisioning
            try {
              // Soft delete the device - no Fiskaly client to clean up
              await prisma.posDevice.update({
                where: { id: deviceId },
                data: {
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedBy: req.rbacUser?.id || null,
                  deletionReason: deletionReason + " (Fiskaly client not found)",
                  fiskalyDeprovisioned: true, // Considered "deprovisioned" since no client exists
                  isActive: false,
                  // Clear Fiskaly fields to avoid confusion
                  fiskalyClientId: null,
                  fiskalyClientSerialNumber: null,
                  fiskalyClientProvisioningStatus: null,
                  fiskalyClientProvisioningLastErrorCode: null,
                  fiskalyClientProvisioningLastErrorMessage: null,
                },
              });

              deletionResult = {
                type: "soft",
                fiskalyDeprovisioned: true, // Considered "deprovisioned" since no client exists
                message: "Device deleted (Fiskaly client was already gone)",
              };

              // Skip to the end - deletion complete
              return;
            } catch (deleteErr: any) {
              console.error("Failed to delete device:", deleteErr);
              throw new Error("Failed to delete device");
            }
          }
          
          // For other errors, assume it has transactions to be safe
          const hasTransactions = true;
          // Stage 3a: Client has transactions - soft delete with warning
          console.info(`Fiskaly client ${device.fiskalyClientId} has transactions, performing soft delete`);

          // Attempt to deprovision anyway (will likely fail but try)
          let deprovisioned = false;
          try {
            await fiskalyService.deprovisionPosDeviceClient({
              organizationId,
              deviceId,
            });
            deprovisioned = true;
            console.info(`Successfully deprovisioned Fiskaly client ${device.fiskalyClientId} despite having transactions`);
          } catch (deprovErr: any) {
            console.info(`Expected: Could not deprovision Fiskaly client due to existing transactions`);
          }

          // Soft delete the device
          await prisma.posDevice.update({
            where: { id: deviceId },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
              deletedBy: req.rbacUser?.id || null,
              deletionReason: deletionReason + " (Fiskaly status check failed)",
              fiskalyDeprovisioned: false,
              isActive: false,
              // Clear Fiskaly fields to avoid confusion
              fiskalyClientId: null,
              fiskalyClientSerialNumber: null,
              fiskalyClientProvisioningStatus: null,
              fiskalyClientProvisioningLastErrorCode: null,
              fiskalyClientProvisioningLastErrorMessage: null,
            },
          });

          deletionResult = {
            type: "soft",
            fiskalyDeprovisioned: false,
            message: "Device deleted with conservative approach due to Fiskaly status check failure",
            warnings: [
              "Could not verify Fiskaly client status",
              "Fiskaly client may still be active",
              "Manual verification recommended"
            ],
          };
        }

      } else {
        // Stage 4: No Fiskaly client - simple delete
        console.info(`Device ${deviceId} has no Fiskaly client, performing simple delete`);

        await prisma.posDevice.delete({ where: { id: deviceId } });

        deletionResult = {
          type: "full",
          fiskalyDeprovisioned: true, // N/A but true for consistency
          message: "Device successfully deleted (no Fiskaly client to clean up)",
        };
      }

      // Stage 5: Log the deletion for audit
      try {
        await AuditLogService.write({
          action: "DELETE_POS_DEVICE",
          entityType: "PosDevice",
          entityId: deviceId,
          scope: { organizationId },
          actor: AuditLogService.getActorFromRequest(req),
          metadata: {
            deviceName: device.name,
            deviceCode: device.deviceCode,
            deletionType: deletionResult.type,
            fiskalyDeprovisioned: deletionResult.fiskalyDeprovisioned,
            deletionReason,
            warnings: deletionResult.warnings,
          },
        });
      } catch (auditErr: any) {
        console.warn("Failed to audit log device deletion:", auditErr);
      }

      // Stage 6: Return comprehensive result
      const responseData: any = {
        success: true,
        data: {
          id: deviceId,
          deletionType: deletionResult.type,
          fiskalyDeprovisioned: deletionResult.fiskalyDeprovisioned,
          message: deletionResult.message,
        },
      };

      if (deletionResult.warnings && deletionResult.warnings.length > 0) {
        responseData.warnings = deletionResult.warnings;
      }

      console.info(`Device ${deviceId} deletion completed: ${deletionResult.type} delete, Fiskaly deprovisioned: ${deletionResult.fiskalyDeprovisioned}`);
      res.json(responseData);

    } catch (error: any) {
      console.error("Error deleting POS device:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to delete POS device",
        details: error?.message || "Unknown error"
      });
    }
  };

  /**
   * Manually provision a Fiskaly client for a POS device (idempotent).
   */
  public provisionPosDeviceFiskalyClient = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      const deviceId = req.params.deviceId;
      if (!organizationId || !deviceId) {
        res.status(400).json({ success: false, error: "organizationId and deviceId are required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;
      const device = await prisma.posDevice.findFirst({
        where: { id: deviceId, organizationId },
      });
      if (!device) {
        res.status(404).json({ success: false, error: "POS device not found" });
        return;
      }

      // Ensure device is active
      if (!device.isActive) {
        res.status(400).json({ success: false, error: "Device must be active to provision Fiskaly client" });
        return;
      }

      await FiskalyService.getInstance().provisionPosDeviceClient({
        organizationId,
        deviceId,
      });

      const updated = await prisma.posDevice.findFirst({
        where: { id: deviceId, organizationId },
      });

      res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error("Error provisioning Fiskaly client for POS device:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };

  /**
   * Toggle Fiskaly enable/disable for an organization (safe).
   * Preserves org-level provisioning data and per-device Fiskaly client IDs to avoid
   * breaking historical receipts/auditability.
   * Admin-only.
   */
  public toggleFiskalyForOrganization = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;

      const existingSettings = await prisma.settings.findUnique({
        where: { organizationId },
        select: { id: true, fiskalyEnabled: true },
      });

      if (!existingSettings) {
        res.status(404).json({ success: false, error: "Organization settings not found" });
        return;
      }

      const newEnabled = !existingSettings.fiskalyEnabled;

      // Local-only toggle (reversible). If the TSS was permanently DISABLED in Fiskaly,
      // prevent enabling to avoid UI/DB claiming it is enabled while Fiskaly is permanently disabled.
      if (newEnabled) {
        try {
          const verify = await FiskalyService.getInstance().verifyFiskalyStatus({ organizationId });
          const state = String((verify as any)?.state || "");
          if (state === "DISABLED") {
            res.status(409).json({
              success: false,
              error:
                "Fiskaly TSS is permanently DISABLED and cannot be enabled again. Rotate/Recommission to create a new TSS.",
              code: "FISKALY_TSS_PERMANENTLY_DISABLED",
            });
            return;
          }
        } catch {
          // If verification fails (e.g. not configured yet), allow local enable.
        }
      }

      await prisma.settings.update({
        where: { organizationId },
        data: {
          fiskalyEnabled: newEnabled,
        },
      });

      const message = newEnabled
        ? "Fiskaly enabled for organization"
        : "Fiskaly disabled for organization";

      res.json({ success: true, message, data: { fiskalyEnabled: newEnabled } });
    } catch (error) {
      console.error("Error toggling Fiskaly for organization:", error);
      res.status(500).json({ success: false, error: "Failed to toggle Fiskaly" });
    }
  };

  public disableFiskalyTssPermanently = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;
      const existingSettings = await prisma.settings.findUnique({
        where: { organizationId },
        select: { id: true },
      });
      if (!existingSettings) {
        res.status(404).json({ success: false, error: "Organization settings not found" });
        return;
      }

      const result = await FiskalyService.getInstance().setTssStateForOrganization({
        organizationId,
        state: "DISABLED",
      });

      await prisma.settings.update({
        where: { organizationId },
        data: { fiskalyEnabled: false },
      });

      res.json({
        success: true,
        message: "Fiskaly TSS permanently disabled",
        data: { fiskalyEnabled: false, state: (result as any)?.state },
      });
    } catch (error: any) {
      console.error("Error permanently disabling Fiskaly TSS:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message || "Failed to disable Fiskaly TSS" });
    }
  };

  /**
   * Decommission Fiskaly TSS for an organization (true deactivation).
   * Attempts to deactivate TSS via Fiskaly API and revokes credentials.
   * Falls back to manual workflow if API doesn't support deactivation.
   */
  public decommissionFiskalyForOrganization = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const result = await FiskalyService.getInstance().decommissionFiskalyForOrganization({
        organizationId,
      });

      res.json({
        success: true,
        message: result.message,
        data: {
          apiDeactivationSuccessful: result.apiDeactivationSuccessful,
          requiresManualAction: result.requiresManualAction,
          deactivationDetails: result.deactivationDetails,
        },
      });
    } catch (error: any) {
      console.error("Error decommissioning Fiskaly for organization:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message || "Failed to decommission Fiskaly" });
    }
  };

  /**
   * Recommission Fiskaly TSS for an organization (reactivation).
   * Reactivates TSS and generates new credentials.
   */
  public recommissionFiskalyForOrganization = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const result = await FiskalyService.getInstance().recommissionFiskalyForOrganization({
        organizationId,
      });

      res.json({
        success: true,
        message: result.message,
        data: {
          newClientId: result.newClientId,
        },
      });
    } catch (error: any) {
      console.error("Error recommissioning Fiskaly for organization:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message || "Failed to recommission Fiskaly" });
    }
  };

  /**
   * Verify Fiskaly TSS status for an organization.
   * Checks if TSS is active/inactive via Fiskaly API.
   */
  public verifyFiskalyStatus = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const result = await FiskalyService.getInstance().verifyFiskalyStatus({
        organizationId,
      });

      const response = {
        success: result.success,
        message: result.message,
        data: {
          status: result.status,
          state: (result as any).state,
          tssInfo: (result as any).tssInfo,
        },
      };
      res.json(response);
    } catch (error: any) {
      console.error("Error verifying Fiskaly status:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message || "Failed to verify Fiskaly status" });
    }
  };

  /**
   * Rotate Fiskaly fiscal profile (advanced).
   * - Generates a new TSS ID and re-provisions the organization TSS.
   * - Clears per-device Fiskaly client fields to force re-provisioning.
   * - Preserves historical fiscal transactions.
   */
  public rotateFiskalyForOrganization = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;

      const existingSettings = await prisma.settings.findUnique({
        where: { organizationId },
      });

      if (!existingSettings) {
        res.status(404).json({ success: false, error: "Organization settings not found" });
        return;
      }

      const nextTssId = uuidv4();

      await prisma.settings.update({
        where: { organizationId },
        data: {
          fiskalyEnabled: true,
          fiskalyTssId: nextTssId,
          fiskalyTssAdminPuk: null,
          fiskalyTssAdminPinEncrypted: null,
          fiskalyProvisioningStatus: null,
          fiskalyProvisioningLastErrorCode: null,
          fiskalyProvisioningLastErrorMessage: null,
          fiskalyProvisionedAt: null,
        },
      });

      await prisma.posDevice.updateMany({
        where: { organizationId },
        data: {
          fiskalyClientId: null,
          fiskalyClientSerialNumber: null,
          fiskalyClientProvisioningStatus: null,
          fiskalyClientProvisioningLastErrorCode: null,
          fiskalyClientProvisioningLastErrorMessage: null,
        },
      });

      await FiskalyService.getInstance().provisionOrganizationTss({ organizationId });

      const refreshed = await prisma.settings.findUnique({
        where: { organizationId },
      });

      res.json({
        success: true,
        message: "Fiskaly rotated. POS devices must be re-provisioned.",
        data: refreshed || null,
      });
    } catch (error: any) {
      console.error("Error rotating Fiskaly for organization:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message || "Failed to rotate Fiskaly" });
    }
  };

  // Staff: list only branches assigned to the current authenticated user
  public getMyBranches = async (req: RBACRequest, res: Response) => {
    try {
      if (!req.rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const ids = req.rbacUser.assignedBranchIds || [];
      if (ids.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      const now = new Date();

      const validOrganizationWhere = {
        isActive: true,
        isValidated: true,
        OR: [
          {
            validations: {
              some: {
                isActive: true,
                unvalidatedAt: null,
                expiresAt: { gt: now },
              } as any,
            } as any,
          },
        ],
      };

      const branches = await this.db.getPrisma().branch.findMany({
        where: {
          id: { in: ids },
          isActive: true,
          OR: [
            { organizationId: null },
            {
              organization: {
                ...(validOrganizationWhere as any),
              } as any,
            },
          ],
        } as any,
        include: {
          organization: {
            select: {
              id: true,
              isActive: true,
              freeVersion: true,
              reservationsAllowed: true,
              onlinePaymentsAllowed: true,
              cardPaymentsAllowed: true,
              paypalAllowed: true,
              vouchersAllowed: true,
            } as any,
          } as any,
        } as any,
      });

      res.json({ success: true, data: branches });
    } catch (error) {
      console.error("Error fetching my branches:", error);
      res.status(500).json({ success: false, error: "Failed to fetch branches" });
    }
  };

  // Public: list active branches (for branch switcher)
  public getActiveBranches = async (req: Request, res: Response) => {
    try {
      const rawServiceType = (req.query.serviceType as string | undefined) ?? undefined;
      const serviceType = rawServiceType ? String(rawServiceType).trim().toUpperCase() : undefined;

      const rawSearch =
        (req.query.q as string | undefined) ??
        (req.query.query as string | undefined) ??
        (req.query.search as string | undefined) ??
        undefined;
      const search = rawSearch ? String(rawSearch).trim().toLowerCase() : "";

      const rawServiceMode = (req.query.serviceMode as string | undefined) ?? undefined;
      const serviceMode = rawServiceMode ? String(rawServiceMode).trim().toUpperCase() : undefined;

      const radiusKmRaw = req.query.radiusKm ?? req.query.radius ?? req.query.km;
      const radiusKm = radiusKmRaw !== undefined ? Number(radiusKmRaw) : NaN;
      const hasRadiusKm = !isNaN(radiusKm) && radiusKm > 0;

      const headerOrganizationIdRaw = (req.headers["x-organization-id"] as string | undefined) ?? undefined;
      const headerOrganizationId = headerOrganizationIdRaw ? String(headerOrganizationIdRaw).trim() : undefined;

      const rawOrganizationId = (req.query.organizationId as string | undefined) ?? undefined;
      const queryOrganizationId = rawOrganizationId ? String(rawOrganizationId).trim() : undefined;

      const organizationId = headerOrganizationId || queryOrganizationId;
      const rawOrganizationSlug =
        (req.query.organizationSlug as string | undefined) ??
        (req.query.org as string | undefined) ??
        undefined;
      const organizationSlug = rawOrganizationSlug ? String(rawOrganizationSlug).trim() : undefined;

      const latRaw = req.query.latitude ?? req.query.lat;
      const lonRaw = req.query.longitude ?? req.query.lon;
      const lat = latRaw !== undefined ? Number(latRaw) : NaN;
      const lon = lonRaw !== undefined ? Number(lonRaw) : NaN;
      const hasLocation = !isNaN(lat) && !isNaN(lon);

      const globalSettings = await (this.db.getPrisma() as any).settings.findFirst({
        where: { organizationId: null },
        select: {
          deliveryEnabled: true,
          deliveryRadius: true,
          initialDeliveryRange: true,
        },
      });

      const now = new Date();

      const validOrganizationWhere = {
        isActive: true,
        isValidated: true,
        OR: [
          {
            validations: {
              some: {
                isActive: true,
                unvalidatedAt: null,
                expiresAt: { gt: now },
              } as any,
            } as any,
          },
        ],
      };

      const organizationWhere = organizationId
        ? { 
            organizationId, 
            organization: { 
              ...(validOrganizationWhere as any),
            } as any 
          }
        : organizationSlug
          ? { 
              organization: { 
                slug: organizationSlug, 
                ...(validOrganizationWhere as any),
              } as any 
            }
          : {
              OR: [
                { organizationId: null }, 
                { 
                  organization: { 
                    ...(validOrganizationWhere as any),
                  } as any 
                }
              ],
            };

      const branches = await this.db.getPrisma().branch.findMany({
        where: {
          isActive: true,
          ...(organizationWhere as any),
        } as any,
        select: {
          id: true,
          isUrgentlyClosed: true,
          urgentCloseMessage: true,
          urgentClosedAt: true,
          urgentClosedByUserId: true,
          name: true,
          code: true,
          branchImage: true,
          serviceType: true,
          address: true,
          city: true,
          state: true,
          country: true,
          latitude: true,
          longitude: true,
          isActive: true,
          businessPhone: true,
          businessEmail: true,
          businessAddress: true,
          reservationIsEnabled: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              isValidated: true,
              validationExpiresAt: true,
              gracePeriodEndsAt: true,
              validations: {
                where: {
                  isActive: true,
                },
                orderBy: {
                  validatedAt: "desc",
                },
                take: 1,
                select: {
                  expiresAt: true,
                  gracePeriodEndsAt: true,
                  isActive: true,
                  unvalidatedAt: true,
                },
              } as any,
              freeVersion: true,
              reservationsAllowed: true,
              reservationSettings: {
                select: {
                  isEnabled: true,
                },
              },
              onlinePaymentsAllowed: true,
              cardPaymentsAllowed: true,
              paypalAllowed: true,
              settings: {
                select: {
                  businessName: true,
                  businessLogo: true,
                  businessPhone: true,
                  businessEmail: true,
                  businessAddress: true,
                  latitude: true,
                  longitude: true,
                  serviceType: true,
                  appStatus: true,
                  deliveryEnabled: true,
                  deliveryRadius: true,
                  initialDeliveryRange: true,
                },
              },
            } as any,
          } as any,
          pickupEnabled: true,
          deliveryEnabled: true,
          deliveryRadius: true,
          // Financial Settings
          deliveryFee: true,
          deliveryRatePerKilometer: true,
          useDynamicDeliveryFee: true,
          useTieredDeliveryFee: true,
          initialDeliveryRange: true,
          initialDeliveryPrice: true,
          extendedDeliveryThreshold: true,
          extendedDeliveryRate: true,
          enableFreeDelivery: true,
          freeDeliveryThreshold: true,
          taxPercentage: true,
          serviceTaxPercentage: true,
          deliveryTaxPercentage: true,
          taxInclusive: true,
          enableMinimumOrder: true,
          minimumOrderAmount: true,
          currency: true,
          // Payment Settings
          acceptCash: true,
          acceptCard: true,
          acceptOnlinePayment: true,
          acceptPayPal: true,
          // Pickup Payment Settings
          pickupAcceptCash: true,
          pickupAcceptCard: true,
          pickupAcceptOnlinePayment: true,
          pickupAcceptPayPal: true,
          pickupTakeawayServiceFee: true,
          // Future Order Settings
          futureOrdersEnabled: true,
          enableFuturePickupOrders: true,
          futurePickupOrderDays: true,
          enableFutureDeliveryOrders: true,
          futureDeliveryOrderDays: true,
          // Scheduled Order Merge Settings
          allowScheduledOrderMerge: true,
          scheduledOrderMergeCutoffHours: true,
          // Scheduled Order Management Settings (branch overrides; null = inherit from global)
          scheduledOrderAllowCancellation: true,
          scheduledOrderCancellationWindowHours: true,
          scheduledOrderAllowModification: true,
          scheduledOrderModificationWindowHours: true,
          scheduledOrderAllowShallowModification: true,
          scheduledOrderAutoConfirm: true,
          scheduledOrderMinimumAmount: true,
          // Scheduled Order Time Slot Settings
          scheduledOrderTimeSlotInterval: true,
          // Scheduled Order Capacity
          scheduledOrderMaxOrdersPerSlot: true,
        } as any,
      });

      res.setHeader("x-branches-filter", "org_validation_expires");

      const nowAfterQuery = new Date();

      const normalizeServiceType = (raw: any): string | null => {
        if (!raw) return null;
        const v = String(raw).trim().toUpperCase();
        if (v === "RESTAURANT") return "RESTAURANT";
        if (v === "MEAT_SHOP" || v === "MEATSHOP" || v === "MEAT SHOP" || v === "MEAT-SHOP") return "MEAT_SHOP";
        if (v === "BAKERY") return "BAKERY";
        if (v === "FOOD_TRUCK" || v === "FOODTRUCK" || v === "FOOD TRUCK" || v === "FOOD-TRUCK") return "FOOD_TRUCK";
        return null;
      };

      const effectiveServiceTypeOf = (b: any): string => {
        const direct = normalizeServiceType(b?.serviceType);
        if (direct) return direct;
        const fromOrg = normalizeServiceType(b?.organization?.settings?.serviceType);
        return fromOrg || "RESTAURANT";
      };

      const parseCoordinate = (coord: any): number | null => {
        if (coord === undefined || coord === null) return null;
        if (typeof coord === "number") return coord;
        const parsed = Number(coord);
        return isNaN(parsed) ? null : parsed;
      };

      const parsePositiveNumber = (val: any): number | null => {
        if (val === undefined || val === null) return null;
        const n = typeof val === "number" ? val : Number(val);
        if (isNaN(n) || n <= 0) return null;
        return n;
      };

      const resolveDeliveryEnabled = (b: any): boolean => {
        const branchVal = (b as any)?.deliveryEnabled;
        if (branchVal !== null && branchVal !== undefined) return Boolean(branchVal);

        const fromOrg = (b as any)?.organization?.settings?.deliveryEnabled;
        if (fromOrg !== null && fromOrg !== undefined) return Boolean(fromOrg);

        const fromGlobal = (globalSettings as any)?.deliveryEnabled;
        if (fromGlobal !== null && fromGlobal !== undefined) return Boolean(fromGlobal);

        return true;
      };

      const resolveDeliveryRadiusKm = (b: any): number | null => {
        const branchRadius = parsePositiveNumber((b as any)?.deliveryRadius);
        if (branchRadius !== null) return branchRadius;

        const orgRadius = parsePositiveNumber((b as any)?.organization?.settings?.deliveryRadius);
        if (orgRadius !== null) return orgRadius;

        const globalRadius = parsePositiveNumber((globalSettings as any)?.deliveryRadius);
        if (globalRadius !== null) return globalRadius;

        // If no explicit deliveryRadius anywhere, fall back to initialDeliveryRange.
        const branchInitial = parsePositiveNumber((b as any)?.initialDeliveryRange);
        if (branchInitial !== null) return branchInitial;

        const orgInitial = parsePositiveNumber((b as any)?.organization?.settings?.initialDeliveryRange);
        if (orgInitial !== null) return orgInitial;

        const globalInitial = parsePositiveNumber((globalSettings as any)?.initialDeliveryRange);
        if (globalInitial !== null) return globalInitial;

        return null;
      };

      const canDeliverTo = (b: any): boolean => {
        if (!hasLocation) return true;

        if (!resolveDeliveryEnabled(b)) return false;

        const branchLat = parseCoordinate(b?.latitude);
        const branchLon = parseCoordinate(b?.longitude);

        const radiusKm = resolveDeliveryRadiusKm(b);

        if (branchLat === null || branchLon === null) return false;
        if (radiusKm === null) return false;
        const dKm = calculateDistance(lat, lon, branchLat, branchLon);
        return dKm <= radiusKm;
      };

      const withinCustomerRadius = (b: any): boolean => {
        if (!hasLocation) return true;
        if (!hasRadiusKm) return true;

        const branchLat = parseCoordinate(b?.latitude);
        const branchLon = parseCoordinate(b?.longitude);
        if (branchLat === null || branchLon === null) return false;

        const dKm = calculateDistance(lat, lon, branchLat, branchLon);
        return dKm <= radiusKm;
      };

      const filtered = branches.filter((b: any) => {
        if (search) {
          const branchName = String(b?.name || "").toLowerCase();
          const branchCode = String(b?.code || "").toLowerCase();
          const orgName = String(b?.organization?.name || "").toLowerCase();
          const businessName = String(b?.organization?.settings?.businessName || "").toLowerCase();
          const orgSlug = String(b?.organization?.slug || "").toLowerCase();

          const haystack = `${branchName} ${branchCode} ${orgName} ${businessName} ${orgSlug}`.trim();
          if (!haystack.includes(search)) return false;
        }

        if (serviceType) {
          if (effectiveServiceTypeOf(b) !== serviceType) return false;
        }

        // Backwards compatible default: if serviceMode is not provided, behave like the old
        // directory (deliverable if location is known, otherwise don't restrict by delivery).
        if (!serviceMode) {
          if (!canDeliverTo(b)) return false;
          return true;
        }

        if (serviceMode === "DELIVERY") {
          // When explicitly requesting delivery mode, only return branches that have delivery enabled.
          // If location is provided, also require that the branch can deliver to that location.
          if (!resolveDeliveryEnabled(b)) return false;
          if (!canDeliverTo(b)) return false;
          return true;
        }

        if (serviceMode === "PICKUP") {
          if ((b as any)?.pickupEnabled === false) return false;
          if (!withinCustomerRadius(b)) return false;
          return true;
        }

        if (serviceMode === "RESERVATION") {
          const org = (b as any)?.organization;
          const orgAllowed = org?.reservationsAllowed !== false;
          const orgEnabled = org?.reservationSettings?.isEnabled !== false;
          const branchEnabled = (b as any)?.reservationIsEnabled === true;
          if (!orgAllowed) return false;
          if (!orgEnabled) return false;
          if (!branchEnabled) return false;
          if (!withinCustomerRadius(b)) return false;
          return true;
        }

        // Unknown mode: fall back to delivery filtering.
        if (!canDeliverTo(b)) return false;
        return true;
      });

      const branchesFiltered = filtered.filter((b) => {
        const branch = b as any;
        if (!branch?.organizationId) return true;
        const org = (branch as any)?.organization as any;
        if (!org) return false;
        if (org.isActive === false) return false;
        if (org.isValidated !== true) return false;

        const latestValidation = Array.isArray(org?.validations) && org.validations.length > 0 ? org.validations[0] : null;
        if (!latestValidation) return false;
        if (latestValidation.isActive !== true) return false;
        if (latestValidation.unvalidatedAt) return false;
        if (!latestValidation.expiresAt) return false;
        return new Date(latestValidation.expiresAt).getTime() > nowAfterQuery.getTime();
      });

      res.json({ success: true, data: branchesFiltered });
    } catch (error) {
      console.error("Error fetching active branches:", error);
      res.status(500).json({ success: false, error: "Failed to fetch active branches" });
    }
  };

  // Admin: get single branch
  public getBranch = async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const branch = await this.db.getPrisma().branch.findUnique({
        where: { id: req.params.id },
        include: {
          organization: {
            select: {
              id: true,
              isActive: true,
              freeVersion: true,
              reservationsAllowed: true,
              onlinePaymentsAllowed: true,
              cardPaymentsAllowed: true,
              paypalAllowed: true,
              vouchersAllowed: true,
            } as any,
          } as any,
        } as any,
      });
      if (!branch) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      if ((branch as any).organizationId !== organizationId) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      res.json({ success: true, data: branch });
    } catch (error) {
      console.error("Error fetching branch:", error);
      res.status(500).json({ success: false, error: "Failed to fetch branch" });
    }
  };

  // Admin: create branch
  public createBranch = async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const data = req.body;

      if (data?.organizationId && String(data.organizationId) !== String(organizationId)) {
        res.status(400).json({
          success: false,
          error: "organizationId does not match organization context",
        });
        return;
      }

      const createData = {
        ...(data || {}),
        organizationId,
      };

      const org = await this.db.getPrisma().organization.findUnique({
        where: { id: organizationId },
        select: { id: true, maxActiveBranches: true } as any,
      });
      if (!org) {
        res.status(400).json({ success: false, error: "Invalid organizationId" });
        return;
      }

      const limit =
        (org as any).maxActiveBranches !== null && (org as any).maxActiveBranches !== undefined
          ? Number((org as any).maxActiveBranches)
          : null;

      if (limit !== null && Number.isFinite(limit)) {
        const activeCount = await this.db.getPrisma().branch.count({
          where: { organizationId, isActive: true } as any,
        });

        if (activeCount >= limit) {
          res.status(400).json({
            success: false,
            error: `Branch limit exceeded: maxActiveBranches=${limit}`,
          });
          return;
        }
      }

      const branch = await this.db.getPrisma().branch.create({ data: createData });
      res.status(201).json({ success: true, data: branch });
    } catch (error) {
      console.error("Error creating branch:", error);
      res.status(500).json({ success: false, error: "Failed to create branch" });
    }
  };

  // Admin: update branch
  public updateBranch = async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const { id } = req.params;
      const data = req.body || {};

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const reservationsAllowed = (req as any)?.organization?.reservationsAllowed;
      const hasReservationUpdate = Object.keys(data || {}).some((k) => String(k).startsWith("reservation"));
      if (!isSuperAdmin && reservationsAllowed === false && hasReservationUpdate) {
        res.status(403).json({
          success: false,
          error: "Reservations are disabled for this organization",
        });
        return;
      }

      const existing = await this.db.getPrisma().branch.findUnique({ where: { id } });
      if (!existing || (existing as any).organizationId !== organizationId) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      if ((data as any).organizationId !== undefined) {
        res.status(400).json({
          success: false,
          error: "organizationId cannot be updated via this endpoint",
        });
        return;
      }

      if ((data as any).id !== undefined) {
        delete (data as any).id;
      }

      const willActivate =
        (data as any).isActive !== undefined && Boolean((data as any).isActive) === true;
      const wasInactive = !(existing as any).isActive;
      if (willActivate && wasInactive) {
        const org = await this.db.getPrisma().organization.findUnique({
          where: { id: organizationId },
          select: { id: true, maxActiveBranches: true } as any,
        });
        if (!org) {
          res.status(400).json({ success: false, error: "Invalid organizationId" });
          return;
        }

        const limit =
          (org as any).maxActiveBranches !== null && (org as any).maxActiveBranches !== undefined
            ? Number((org as any).maxActiveBranches)
            : null;

        if (limit !== null && Number.isFinite(limit)) {
          const activeCount = await this.db.getPrisma().branch.count({
            where: { organizationId, isActive: true } as any,
          });

          if (activeCount >= limit) {
            res.status(400).json({
              success: false,
              error: `Branch limit exceeded: maxActiveBranches=${limit}`,
            });
            return;
          }
        }
      }

      const branch = await this.db.getPrisma().branch.update({
        where: { id },
        data,
      });

      await AuditLogService.writeSafe({
        action: "BRANCH_UPDATE",
        entityType: "Branch",
        entityId: id,
        scope: { organizationId, branchId: id },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existing,
        after: branch,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({ success: true, data: branch });
    } catch (error) {
      console.error("Error updating branch:", error);
      res.status(500).json({ success: false, error: "Failed to update branch" });
    }
  };

  // Admin: delete branch
  public deleteBranch = async (req: OrganizationContextRequest, res: Response) => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const { id } = req.params;

      const existing = await this.db.getPrisma().branch.findUnique({ where: { id } });
      if (!existing || (existing as any).organizationId !== organizationId) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      await this.db.getPrisma().branch.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting branch:", error);
      res.status(500).json({ success: false, error: "Failed to delete branch" });
    }
  };

  public getOrganizations = async (req: RBACRequest, res: Response) => {
    try {
      const search = req.query.search as string | undefined;

      const where: any = {};
      if (search && search.trim()) {
        const searchTerm = search.trim();
        where.OR = [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { organizationNumber: { contains: searchTerm, mode: "insensitive" } },
        ];
      }

      const organizations = await this.db.getPrisma().organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          organizationNumber: true,
          isActive: true,
          isValidated: true,
          validatedAt: true,
          validatedBy: true,
          validationExpiresAt: true,
          validationNotes: true,
          gracePeriodEndsAt: true,
          maxActiveBranches: true,
          freeVersion: true,
          reservationsAllowed: true,
          onlinePaymentsAllowed: true,
          cardPaymentsAllowed: true,
          paypalAllowed: true,
          vouchersAllowed: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: "asc" }],
      });
      res.json({ success: true, data: organizations });
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ success: false, error: "Failed to fetch organizations" });
    }
  };

  public createOrganization = async (req: RBACRequest, res: Response) => {
    try {
      const body = (req.body || {}) as any;
      const { name, slug } = body as { name?: string; slug?: string };
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ success: false, error: "name is required" });
        return;
      }

      const baseSlug = typeof slug === "string" && slug.trim().length > 0 ? toSlug(slug) : toSlug(name);
      if (!baseSlug) {
        res.status(400).json({ success: false, error: "slug is invalid" });
        return;
      }

      const prisma = this.db.getPrisma();
      let finalSlug = baseSlug;
      for (let i = 0; i < 50; i++) {
        const exists = await prisma.organization.findUnique({ where: { slug: finalSlug } });
        if (!exists) break;
        finalSlug = `${baseSlug}-${i + 2}`;
      }

      const createData: any = {
        name: name.trim(),
        slug: finalSlug,
        isActive: true,
      };

      if (body.maxActiveBranches !== undefined) {
        if (body.maxActiveBranches === null || body.maxActiveBranches === "") {
          createData.maxActiveBranches = null;
        } else {
          const parsed = Number(body.maxActiveBranches);
          if (!Number.isFinite(parsed) || parsed < 0) {
            res.status(400).json({
              success: false,
              error: "maxActiveBranches must be a non-negative number or null",
            });
            return;
          }
          createData.maxActiveBranches = Math.floor(parsed);
        }
      }

      if (body.reservationsAllowed !== undefined) {
        createData.reservationsAllowed = Boolean(body.reservationsAllowed);
      }
      if (body.onlinePaymentsAllowed !== undefined) {
        createData.onlinePaymentsAllowed = Boolean(body.onlinePaymentsAllowed);
      }
      if (body.cardPaymentsAllowed !== undefined) {
        createData.cardPaymentsAllowed = Boolean(body.cardPaymentsAllowed);
      }
      if (body.paypalAllowed !== undefined) {
        createData.paypalAllowed = Boolean(body.paypalAllowed);
      }
      if (body.vouchersAllowed !== undefined) {
        createData.vouchersAllowed = Boolean(body.vouchersAllowed);
      }
      if (body.freeVersion !== undefined) {
        createData.freeVersion = Boolean(body.freeVersion);
        
        // When freeVersion is enabled, automatically disable all paid features and limit branches to 1
        if (createData.freeVersion === true) {
          createData.reservationsAllowed = false;
          createData.onlinePaymentsAllowed = false;
          createData.cardPaymentsAllowed = false;
          createData.paypalAllowed = false;
          createData.vouchersAllowed = false;
          createData.maxActiveBranches = 1;
        }
      }

      // Auto-generate organizationNumber (sequential: ORG-0001, ORG-0002, etc.)
      const existingOrgs = await prisma.organization.findMany({
        where: {
          organizationNumber: {
            not: '',
          },
        },
        select: {
          organizationNumber: true,
        },
        orderBy: {
          organizationNumber: 'desc',
        },
        take: 1,
      });

      let nextSequence = 1;
      if (existingOrgs.length > 0 && existingOrgs[0].organizationNumber) {
        const maxNumber = existingOrgs[0].organizationNumber;
        const match = maxNumber.match(/ORG-(\d{4})/);
        if (match) {
          nextSequence = parseInt(match[1], 10) + 1;
        }
      }

      createData.organizationNumber = `ORG-${String(nextSequence).padStart(4, '0')}`;

      const organization = await prisma.organization.create({
        data: createData,
      });

      // Create per-organization Settings row.
      // Each organization is independent: do NOT clone/copy values from any existing Settings row.
      // Use Prisma schema defaults for non-nullable fields, and explicitly set nullable fields to null.
      // If the row already exists (e.g., re-running seed/migration), ignore unique constraint errors.
      try {
        await (prisma as any).settings.create({
          data: {
            organizationId: organization.id,

            // Nullable business identity fields
            businessName: null,
            businessEmail: null,
            businessPhone: null,
            businessAddress: null,
            serviceType: "RESTAURANT",
            businessLogo: null,

            // Nullable address fields
            country: null,
            state: null,
            city: null,
            addressLineOne: null,
            latitude: null,
            longitude: null,

            // Nullable delivery pricing fields
            extendedDeliveryThreshold: null,
            extendedDeliveryRate: null,

            // Nullable social links
            facebookUrl: null,
            instagramUrl: null,
            twitterUrl: null,
            websiteUrl: null,

            // Nullable hours fields
            fridayClose: null,
            fridayOpen: null,
            mondayClose: null,
            mondayOpen: null,
            saturdayClose: null,
            saturdayOpen: null,
            sundayClose: null,
            sundayOpen: null,
            thursdayClose: null,
            thursdayOpen: null,
            tuesdayClose: null,
            tuesdayOpen: null,
            wednesdayClose: null,
            wednesdayOpen: null,

            // Nullable "periods" JSON
            fridayPeriods: null,
            mondayPeriods: null,
            saturdayPeriods: null,
            sundayPeriods: null,
            thursdayPeriods: null,
            tuesdayPeriods: null,
            wednesdayPeriods: null,

            // Nullable branch association
            mainBranchId: null,

            // Nullable reservation-related settings stored on Settings
            reservationDepositPercentage: null,

            // Nullable scheduled order fields (explicitly null to avoid defaulting)
            scheduledOrderMinimumAmount: null,
            scheduledOrderMaxOrdersPerSlot: null,
          } as any,
        });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
      }

      // Create per-organization ReservationSettings row.
      // Keep it independent (no cloning). Use a minimal explicit default and leave nullable fields as null.
      try {
        await (prisma as any).reservationSettings.create({
          data: {
            organizationId: organization.id,
            tier: "SIMPLE",
          } as any,
        });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
      }

      // Auto-create a default branch for the new organization
      try {
        const settings = await (prisma as any).settings.findUnique({
          where: { organizationId: organization.id },
        });

        const branch = await prisma.branch.create({
          data: {
            organizationId: organization.id,
            name: organization.name,
            code: "MAIN",
            isActive: true,
            // Copy relevant settings from Settings record
            taxPercentage: settings?.taxPercentage,
            serviceTaxPercentage: settings?.serviceTaxPercentage,
            deliveryTaxPercentage: settings?.deliveryTaxPercentage,
            deliveryFee: settings?.deliveryFee,
            taxInclusive: settings?.taxInclusive,
            currency: settings?.currency,
            enableMinimumOrder: settings?.enableMinimumOrder,
            minimumOrderAmount: settings?.minimumOrderAmount,
            pickupEnabled: settings?.pickupEnabled,
            deliveryEnabled: settings?.deliveryEnabled,
            acceptCash: settings?.acceptCash,
            acceptCard: settings?.acceptCard,
            acceptOnlinePayment: settings?.acceptOnlinePayment,
            pickupAcceptCash: settings?.pickupAcceptCash,
            pickupAcceptCard: settings?.pickupAcceptCard,
            pickupAcceptOnlinePayment: settings?.pickupAcceptOnlinePayment,
            pickupAcceptPayPal: settings?.pickupAcceptPayPal,
            pickupTakeawayServiceFee: settings?.pickupTakeawayServiceFee,
            deliveryRadius: settings?.deliveryRadius,
            deliveryRatePerKilometer: settings?.deliveryRatePerKilometer,
            useDynamicDeliveryFee: settings?.useDynamicDeliveryFee,
            useTieredDeliveryFee: settings?.useTieredDeliveryFee,
            initialDeliveryRange: settings?.initialDeliveryRange,
            initialDeliveryPrice: settings?.initialDeliveryPrice,
            extendedDeliveryThreshold: settings?.extendedDeliveryThreshold,
            extendedDeliveryRate: settings?.extendedDeliveryRate,
            enableFreeDelivery: settings?.enableFreeDelivery,
            freeDeliveryThreshold: settings?.freeDeliveryThreshold,
            deliveryTimeEstimate: settings?.deliveryTimeEstimate,
            orderPreparationTime: settings?.orderPreparationTime,
            maxOrderQuantity: settings?.maxOrderQuantity,
            allowExcludeOptionalIngredients: settings?.allowExcludeOptionalIngredients,
            orderMergeTimeframeMinutes: settings?.orderMergeTimeframeMinutes,
            allowOrdersOutsideHours: settings?.allowOrdersOutsideHours,
          },
        });

        // Set the branch as the main branch
        await (prisma as any).settings.update({
          where: { organizationId: organization.id },
          data: { mainBranchId: branch.id },
        });

        console.info(`[Organization Creation] Auto-created default branch ${branch.id} for organization ${organization.id}`);
      } catch (branchError: any) {
        // Log the error but don't fail the organization creation
        console.error(`[Organization Creation] Failed to auto-create default branch for organization ${organization.id}:`, branchError);
      }

      res.status(201).json({ success: true, data: organization });
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ success: false, error: "Failed to create organization" });
    }
  };

  public getBranchesWithoutOrganization = async (_req: RBACRequest, res: Response) => {
    try {
      const branches = await this.db.getPrisma().branch.findMany({
        where: { organizationId: null },
        orderBy: [{ createdAt: "asc" }],
      });
      res.json({ success: true, data: branches });
    } catch (error) {
      console.error("Error fetching unassigned branches:", error);
      res.status(500).json({ success: false, error: "Failed to fetch unassigned branches" });
    }
  };

  public setBranchOrganization = async (req: RBACRequest, res: Response) => {
    try {
      const branchId = req.params.id;
      const { organizationId } = (req.body || {}) as { organizationId?: string | null };

      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }

      if (organizationId !== null && organizationId !== undefined) {
        const org = await this.db.getPrisma().organization.findUnique({ where: { id: organizationId } });
        if (!org) {
          res.status(404).json({ success: false, error: "Organization not found" });
          return;
        }
      }

      const prisma = this.db.getPrisma() as any;
      const existing = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, organizationId: true },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      const nextOrgId = organizationId ?? null;
      if (String(existing.organizationId || "") === String(nextOrgId || "")) {
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        res.json({ success: true, data: branch });
        return;
      }

      const result = await prisma.$transaction(async (tx: any) => {
        const branch = await tx.branch.update({
          where: { id: branchId },
          data: { organizationId: nextOrgId },
        });

        const prevOrgId = existing.organizationId;
        if (prevOrgId) {
          // If the moved branch was set as the old organization's mainBranchId, clear it.
          try {
            await (tx as any).settings.updateMany({
              where: { organizationId: prevOrgId, mainBranchId: branchId },
              data: { mainBranchId: null },
            });
          } catch {
            // settings table may not exist in some deployments; ignore
          }

          // Remove this branchId from excludedBranches arrays in the old org.
          await this.removeBranchIdFromExcludedBranches(tx, prevOrgId, branchId);
        }

        // Price overrides for this branch become ambiguous after org move; remove them.
        await Promise.all([
          (tx as any).mealBranchPrice?.deleteMany?.({ where: { branchId } }),
          (tx as any).addonBranchPrice?.deleteMany?.({ where: { branchId } }),
          (tx as any).dealBranchPrice?.deleteMany?.({ where: { branchId } }),
          (tx as any).dealComponentBranchPrice?.deleteMany?.({ where: { branchId } }),
        ]);

        return branch;
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error updating branch organization:", error);
      res.status(500).json({ success: false, error: "Failed to update branch organization" });
    }
  };

  public getBranchTypes = async (_req: RBACRequest, res: Response) => {
    try {
      const types = await this.db.getPrisma().branchType.findMany({
        orderBy: [{ createdAt: "asc" }],
      });
      res.json({ success: true, data: types });
    } catch (error) {
      console.error("Error fetching branch types:", error);
      res.status(500).json({ success: false, error: "Failed to fetch branch types" });
    }
  };

  public createBranchType = async (req: RBACRequest, res: Response) => {
    try {
      const { name, slug } = (req.body || {}) as { name?: string; slug?: string };
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ success: false, error: "name is required" });
        return;
      }

      const baseSlug = typeof slug === "string" && slug.trim().length > 0 ? toSlug(slug) : toSlug(name);
      if (!baseSlug) {
        res.status(400).json({ success: false, error: "slug is invalid" });
        return;
      }

      const prisma = this.db.getPrisma();
      let finalSlug = baseSlug;
      for (let i = 0; i < 50; i++) {
        const exists = await prisma.branchType.findUnique({ where: { slug: finalSlug } });
        if (!exists) break;
        finalSlug = `${baseSlug}-${i + 2}`;
      }

      const branchType = await prisma.branchType.create({
        data: {
          name: name.trim(),
          slug: finalSlug,
        },
      });

      res.status(201).json({ success: true, data: branchType });
    } catch (error) {
      console.error("Error creating branch type:", error);
      res.status(500).json({ success: false, error: "Failed to create branch type" });
    }
  };

  public setBranchType = async (req: RBACRequest, res: Response) => {
    try {
      const branchId = req.params.id;
      const { branchTypeId } = (req.body || {}) as { branchTypeId?: string | null };

      if (branchTypeId !== null && branchTypeId !== undefined) {
        const type = await this.db.getPrisma().branchType.findUnique({ where: { id: branchTypeId } });
        if (!type) {
          res.status(404).json({ success: false, error: "Branch type not found" });
          return;
        }
      }

      const branch = await this.db.getPrisma().branch.update({
        where: { id: branchId },
        data: { branchTypeId: branchTypeId ?? null },
      });

      res.json({ success: true, data: branch });
    } catch (error) {
      console.error("Error updating branch type:", error);
      res.status(500).json({ success: false, error: "Failed to update branch type" });
    }
  };

  // Public: get main branch
  public getMainBranch = async (_req: Request, res: Response) => {
    try {
      const branch = await BranchService.getMainBranch();
      if (!branch) {
        res.status(404).json({ success: false, error: "Main branch not found" });
        return;
      }
      res.json({ success: true, data: branch });
    } catch (error) {
      console.error("Error fetching main branch:", error);
      res.status(500).json({ success: false, error: "Failed to fetch main branch" });
    }
  };

  // Public: delivery availability check
  public checkDeliveryAvailability = async (req: Request, res: Response) => {
    try {
      // Accept both 'lat'/'lon' and 'latitude'/'longitude' for compatibility
      const lat = Number(req.query.latitude || req.query.lat);
      const lon = Number(req.query.longitude || req.query.lon);

      if (isNaN(lat) || isNaN(lon)) {
        res.status(400).json({
          success: false,
          error: "latitude/longitude (or lat/lon) are required and must be numbers",
        });
        return;
      }

      const result = await BranchService.checkDeliveryAvailability(lat, lon);

      if (!result.available) {
        res.json({ success: true, available: false, message: result.message });
        return;
      }

      res.json({
        success: true,
        available: true,
        branch: result.branch,
        distance: result.distance,
      });
    } catch (error) {
      console.error("Error checking delivery availability:", error);
      res.status(500).json({ success: false, error: "Failed to check delivery availability" });
    }
  };

  // Admin: urgent close branch
  public urgentCloseBranch = async (req: RBACRequest, res: Response) => {
    try {
      const branchId = req.params.id;
      const { message } = (req.body || {}) as { message?: string };

      const prisma = this.db.getPrisma();

      // Get current branch state for audit log
      const before = await prisma.branch.findUnique({
        where: { id: branchId },
        select: {
          id: true,
          name: true,
          isUrgentlyClosed: true,
          urgentCloseMessage: true,
          urgentClosedAt: true,
          urgentClosedByUserId: true,
          organizationId: true,
        },
      });

      if (!before) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      const actor = AuditLogService.getActorFromRequest(req);
      const now = new Date();

      // Use provided message or default
      const closeMessage =
        message && message.trim().length > 0
          ? message.trim()
          : "This branch is temporarily closed due to an emergency. We apologize for the inconvenience.";

      const after = await prisma.branch.update({
        where: { id: branchId },
        data: {
          isUrgentlyClosed: true,
          urgentCloseMessage: closeMessage,
          urgentClosedAt: now,
          urgentClosedByUserId: actor.userId || null,
        },
      });

      // Write audit log
      await AuditLogService.writeSafe({
        action: "BRANCH_URGENT_CLOSE",
        entityType: "Branch",
        entityId: branchId,
        scope: {
          organizationId: before.organizationId,
          branchId: branchId,
        },
        actor: actor,
        before: {
          isUrgentlyClosed: before.isUrgentlyClosed,
          urgentCloseMessage: before.urgentCloseMessage,
        },
        after: {
          isUrgentlyClosed: after.isUrgentlyClosed,
          urgentCloseMessage: after.urgentCloseMessage,
        },
        metadata: {
          message: closeMessage,
          closedAt: now.toISOString(),
        },
      });

      res.json({ success: true, data: after });
    } catch (error) {
      console.error("Error urgently closing branch:", error);
      res.status(500).json({ success: false, error: "Failed to urgently close branch" });
    }
  };

  // Admin: reopen branch
  public reopenBranch = async (req: RBACRequest, res: Response) => {
    try {
      const branchId = req.params.id;
      const prisma = this.db.getPrisma();

      // Get current branch state for audit log
      const before = await prisma.branch.findUnique({
        where: { id: branchId },
        select: {
          id: true,
          name: true,
          isUrgentlyClosed: true,
          urgentCloseMessage: true,
          urgentClosedAt: true,
          urgentClosedByUserId: true,
          organizationId: true,
        },
      });

      if (!before) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      if (!before.isUrgentlyClosed) {
        res.status(400).json({ success: false, error: "Branch is not urgently closed" });
        return;
      }

      const actor = AuditLogService.getActorFromRequest(req);

      const after = await prisma.branch.update({
        where: { id: branchId },
        data: {
          isUrgentlyClosed: false,
          urgentCloseMessage: null,
          urgentClosedAt: null,
          urgentClosedByUserId: null,
        },
      });

      // Write audit log
      await AuditLogService.writeSafe({
        action: "BRANCH_REOPEN",
        entityType: "Branch",
        entityId: branchId,
        scope: {
          organizationId: before.organizationId,
          branchId: branchId,
        },
        actor: actor,
        before: {
          isUrgentlyClosed: before.isUrgentlyClosed,
          urgentCloseMessage: before.urgentCloseMessage,
          urgentClosedAt: before.urgentClosedAt,
        },
        after: {
          isUrgentlyClosed: after.isUrgentlyClosed,
          urgentCloseMessage: after.urgentCloseMessage,
        },
      });

      res.json({ success: true, data: after });
    } catch (error) {
      console.error("Error reopening branch:", error);
      res.status(500).json({ success: false, error: "Failed to reopen branch" });
    }
  };

  /**
   * Update Fiskaly organization master data with German tax information (STNR and USTID).
   * This updates the Fiskaly DSFinV-K organization record which populates cashpointclosing.csv
   * fields: STNR (tax_number) and USTID (vat_id).
   */
  public updateFiskalyTaxInfo = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const { taxNumber, vatId, fiscalName, fiscalStreet, fiscalZip, fiscalCity, fiscalCountry } = req.body;

      // Validate input
      if (!taxNumber || typeof taxNumber !== "string" || !taxNumber.trim()) {
        res.status(400).json({ success: false, error: "taxNumber is required" });
        return;
      }
      if (!vatId || typeof vatId !== "string" || !vatId.trim()) {
        res.status(400).json({ success: false, error: "vatId is required" });
        return;
      }

      const prisma = this.db.getPrisma() as any;

      // Get organization settings to retrieve fiskalyManagedOrganizationId
      const settings = await prisma.settings.findUnique({
        where: { organizationId },
        select: {
          fiskalyManagedOrganizationId: true,
          fiscalName: true,
          fiscalStreet: true,
          fiscalZip: true,
          fiscalCity: true,
          fiscalCountry: true,
          businessName: true,
        },
      });

      if (!settings?.fiskalyManagedOrganizationId) {
        res.status(400).json({
          success: false,
          error: "Fiskaly managed organization ID not configured. Please set up Fiskaly first.",
        });
        return;
      }

      // IMPORTANT: Update local settings FIRST before pushing to Fiskaly
      // because insertCashRegister reads taxNumber/vatId from the database
      await prisma.settings.update({
        where: { organizationId },
        data: {
          taxNumber: taxNumber.trim(),
          vatId: vatId.trim(),
          ...(fiscalName !== undefined ? { fiscalName: String(fiscalName || "").trim() || null } : {}),
          ...(fiscalStreet !== undefined ? { fiscalStreet: String(fiscalStreet || "").trim() || null } : {}),
          ...(fiscalZip !== undefined ? { fiscalZip: String(fiscalZip || "").trim() || null } : {}),
          ...(fiscalCity !== undefined ? { fiscalCity: String(fiscalCity || "").trim() || null } : {}),
          ...(fiscalCountry !== undefined ? { fiscalCountry: String(fiscalCountry || "").trim().toUpperCase() || null } : {}),
        },
      });

      // Try to update Fiskaly Managed Organization details in the cloud (KassenSichV v2)
      try {
        const finalName = fiscalName !== undefined ? String(fiscalName || "").trim() : settings.fiscalName;
        const finalStreet = fiscalStreet !== undefined ? String(fiscalStreet || "").trim() : settings.fiscalStreet;
        const finalZip = fiscalZip !== undefined ? String(fiscalZip || "").trim() : settings.fiscalZip;
        const finalCity = fiscalCity !== undefined ? String(fiscalCity || "").trim() : settings.fiscalCity;
        const finalCountry = fiscalCountry !== undefined ? String(fiscalCountry || "").trim().toUpperCase() : settings.fiscalCountry;

        await FiskalyService.getInstance().updateFiskalyOrganization({
          organizationId,
          name: finalName || settings.businessName || "Next Foody Store",
          street: finalStreet || "",
          postalCode: finalZip || "",
          city: finalCity || "",
          countryCode: finalCountry || "DEU",
          taxNumber: taxNumber.trim(),
          vatIdNumber: vatId.trim(),
        });
      } catch (cloudErr: any) {
        console.error(`[Fiskaly][ERROR] Failed to update Managed Organization in cloud:`, cloudErr?.message || cloudErr);
      }

      const dsfinvk = DsfinvkService.getInstance();

      // Fetch all provisioned POS devices for this organization
      const provisionedDevices = await prisma.posDevice.findMany({
        where: {
          organizationId,
          fiskalyClientId: { not: null },
          isDeleted: { not: true },
        },
        select: {
          id: true,
          name: true,
          fiskalyClientId: true,
          deviceCode: true,
        },
      });

      if (provisionedDevices.length === 0) {
        res.status(400).json({
          success: false,
          error: "No provisioned POS devices found. Please provision at least one POS device for Fiskaly first.",
          code: "NO_PROVISIONED_DEVICES",
        });
        return;
      }

      const results: Array<{
        deviceId: string;
        deviceName: string;
        cashRegisterId: string;
        success: boolean;
        fiskalyTaxNumber?: string | null;
        fiskalyVatId?: string | null;
        error?: string;
      }> = [];

      // Update tax info on each provisioned cash register
      // insertCashRegister reads taxNumber/vatId from DB, which we just updated above
      for (const device of provisionedDevices) {
        const cashRegisterId = String(device.fiskalyClientId || "").trim();
        if (!cashRegisterId) continue;

        try {
          await dsfinvk.insertCashRegister({
            internalOrganizationId: organizationId,
            fiskalyOrganizationId: settings.fiskalyManagedOrganizationId,
            cashRegisterId,
            cashRegisterExportId: String(device.deviceCode || device.id),
            brand: settings.fiscalName || settings.businessName || null,
            model: device.name || "pos",
            softwareBrand: "Next Foody",
            taxNumber: taxNumber.trim(),
            vatId: vatId.trim(),
          });

          const cashRegisterData = await dsfinvk.retrieveCashRegister({
            internalOrganizationId: organizationId,
            fiskalyOrganizationId: settings.fiskalyManagedOrganizationId,
            cashRegisterId,
          });

          const fiskalyTaxNumber = cashRegisterData?.metadata?.tax_number || null;
          const fiskalyVatId = cashRegisterData?.metadata?.vat_id_number || null;
          const verified =
            fiskalyTaxNumber === taxNumber.trim() &&
            fiskalyVatId === vatId.trim();

          results.push({
            deviceId: device.id,
            deviceName: device.name || "Unnamed",
            cashRegisterId,
            success: verified,
            fiskalyTaxNumber,
            fiskalyVatId,
            ...(verified ? {} : { error: "Fiskaly did not return the saved tax metadata" }),
          });
        } catch (err: any) {
          const errorMsg = err?.message || String(err);
          results.push({ deviceId: device.id, deviceName: device.name || "Unnamed", cashRegisterId, success: false, error: errorMsg });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      if (failureCount > 0) {
        res.status(207).json({
          success: false,
          message: `Verified ${successCount} of ${results.length} cash registers. ${failureCount} did not return the expected Fiskaly metadata.`,
          data: {
            taxNumber: taxNumber.trim(),
            vatId: vatId.trim(),
            results,
          },
        });
        return;
      }

      res.json({
        success: true,
        message: `Tax information saved and verified in Fiskaly metadata (${successCount} cash register${successCount > 1 ? 's' : ''}). Changes will reflect on newly generated cashpointclosing exports.`,
        data: {
          taxNumber: taxNumber.trim(),
          vatId: vatId.trim(),
          results,
        },
      });
    } catch (error: any) {
      console.error("Error updating Fiskaly tax info:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message || "Failed to update tax information in Fiskaly" });
    }
  };

  /**
   * Verify Fiskaly organization master data including tax and location information.
   * This retrieves the organization metadata from Fiskaly to verify STNR and USTID were saved.
   */
  public verifyFiskalyTaxInfo = async (req: RBACRequest, res: Response) => {
    try {
      const organizationId = req.params.id;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const isSuperAdmin = !!req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType);
      const userOrgId = (req.rbacUser as any)?.organizationId as string | null | undefined;
      if (!isSuperAdmin && (!userOrgId || String(userOrgId) !== String(organizationId))) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const prisma = this.db.getPrisma() as any;

      // Get organization settings to retrieve fiskalyManagedOrganizationId
      const settings = await prisma.settings.findUnique({
        where: { organizationId },
        select: {
          fiskalyManagedOrganizationId: true,
          taxNumber: true,
          vatId: true,
        },
      });

      if (!settings?.fiskalyManagedOrganizationId) {
        res.status(400).json({
          success: false,
          error: "Fiskaly managed organization ID not configured. Please set up Fiskaly first.",
        });
        return;
      }

      const dsfinvk = DsfinvkService.getInstance();

      // Fetch all provisioned POS devices for this organization
      const provisionedDevices = await prisma.posDevice.findMany({
        where: {
          organizationId,
          fiskalyClientId: { not: null },
          isDeleted: { not: true },
        },
        select: {
          id: true,
          name: true,
          fiskalyClientId: true,
          deviceCode: true,
        },
      });

      if (provisionedDevices.length === 0) {
        res.status(400).json({
          success: false,
          error: "No provisioned POS devices found. Please provision at least one POS device for Fiskaly first.",
          code: "NO_PROVISIONED_DEVICES",
        });
        return;
      }

      const results: Array<{
        deviceId: string;
        deviceName: string;
        cashRegisterId: string;
        fiskalyTaxNumber: string | null;
        fiskalyVatId: string | null;
        taxMatch: boolean;
        vatMatch: boolean;
        error?: string;
      }> = [];

      // Check tax info on each provisioned cash register
      for (const device of provisionedDevices) {
        const cashRegisterId = String(device.fiskalyClientId || "").trim();
        if (!cashRegisterId) continue;

        try {
          const cashRegisterData = await dsfinvk.retrieveCashRegister({
            internalOrganizationId: organizationId,
            fiskalyOrganizationId: settings.fiskalyManagedOrganizationId,
            cashRegisterId,
          });

          const fiskalyTaxNumber = cashRegisterData?.metadata?.tax_number || null;
          const fiskalyVatId = cashRegisterData?.metadata?.vat_id_number || null;

          results.push({
            deviceId: device.id,
            deviceName: device.name || "Unnamed",
            cashRegisterId,
            fiskalyTaxNumber,
            fiskalyVatId,
            taxMatch: fiskalyTaxNumber === settings.taxNumber,
            vatMatch: fiskalyVatId === settings.vatId,
          });
        } catch (err: any) {
          const errorMsg = err?.message || String(err);
          results.push({
            deviceId: device.id,
            deviceName: device.name || "Unnamed",
            cashRegisterId,
            fiskalyTaxNumber: null,
            fiskalyVatId: null,
            taxMatch: false,
            vatMatch: false,
            error: errorMsg,
          });
        }
      }

      const allTaxMatch = results.length > 0 && results.every(r => r.taxMatch);
      const allVatMatch = results.length > 0 && results.every(r => r.vatMatch);
      const anyErrors = results.some(r => r.error);

      // Get first cash register data for backward compatibility with frontend
      const firstRegister = results[0];

      res.json({
        success: !anyErrors && allTaxMatch && allVatMatch,
        data: {
          local: {
            taxNumber: settings.taxNumber || null,
            vatId: settings.vatId || null,
          },
          // Frontend expects these fields for the verification modal
          fiskaly: firstRegister ? {
            tax_number: firstRegister.fiskalyTaxNumber,
            vat_id: firstRegister.fiskalyVatId,
          } : null,
          match: firstRegister ? {
            taxNumber: firstRegister.taxMatch,
            vatId: firstRegister.vatMatch,
          } : null,
          cashRegisters: results,
          summary: {
            total: results.length,
            taxMatchCount: results.filter(r => r.taxMatch).length,
            vatMatchCount: results.filter(r => r.vatMatch).length,
            allMatch: allTaxMatch && allVatMatch,
          },
        },
      });
    } catch (error: any) {
      console.error("Error verifying Fiskaly tax info:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message || "Failed to verify tax information in Fiskaly" });
    }
  };

  public likeBranch = async (req: any, res: any): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      await BranchService.likeBranch(userId, id);
      res.status(200).json({ success: true, message: "Branch liked successfully" });
    } catch (error: any) {
      console.error("Error liking branch:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to like branch" });
    }
  };

  public unlikeBranch = async (req: any, res: any): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      await BranchService.unlikeBranch(userId, id);
      res.status(200).json({ success: true, message: "Branch unliked successfully" });
    } catch (error: any) {
      console.error("Error unliking branch:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to unlike branch" });
    }
  };

  public getLikedBranches = async (req: any, res: any): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        console.error("[getLikedBranches] Unauthorized - no userId");
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const branches = await BranchService.getLikedBranches(userId);
      res.status(200).json({ success: true, data: branches });
    } catch (error: any) {
      console.error("[getLikedBranches] Error getting liked branches:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to get liked branches" });
    }
  };

  public getOrganizationBranchLikes = async (req: any, res: any): Promise<void> => {
    try {
      const { id } = req.params;
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
      const search = req.query.search ? String(req.query.search) : undefined;
      const branchId = req.query.branchId ? String(req.query.branchId) : undefined;

      const result = await BranchService.getOrganizationBranchLikes(
        id,
        page,
        limit,
        search,
        branchId
      );

      res.status(200).json({
        success: true,
        data: result.users,
        pagination: result.pagination,
      });
    } catch (error: any) {
      console.error("Error getting organization branch likes:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to get branch likes" });
    }
  };
}

export default new BranchController();

