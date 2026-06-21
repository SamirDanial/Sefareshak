import { Request, Response } from "express";
import { PrismaClient, type AppStatus } from "@prisma/client";
import DatabaseSingleton from "../config/database";
import { AuditLogService } from "../services/auditLogService";

const prisma = new PrismaClient();
const APP_STATUS_VALUES: AppStatus[] = [
  "LIVE",
  "COMING_SOON",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
];

type ServiceType = "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK";

const SERVICE_TYPE_VALUES: ServiceType[] = [
  "RESTAURANT",
  "MEAT_SHOP",
  "BAKERY",
  "FOOD_TRUCK",
];

const sanitizeAppStatus = (
  value: unknown
): AppStatus | undefined => {
  if (typeof value !== "string") return undefined;
  return APP_STATUS_VALUES.includes(value as AppStatus)
    ? (value as AppStatus)
    : undefined;
};

const sanitizeServiceType = (value: unknown): ServiceType | undefined => {
  if (typeof value !== "string") return undefined;
  return SERVICE_TYPE_VALUES.includes(value as ServiceType)
    ? (value as ServiceType)
    : undefined;
};

export class SettingsController {
  // Get all settings
  static async getSettings(req: Request, res: Response) {
    try {
      const publicAppUrl = (() => {
        const raw = String(process.env.PUBLIC_APP_URL || "").trim();
        return raw || "https://nextfoody.com";
      })();

      const db = DatabaseSingleton.getInstance();
      const prisma2 = db.getPrisma();

      // Global settings are the Settings row with no organization assigned.
      // If a legacy deployment already has a Settings row that is assigned to an organization,
      // prefer returning it rather than creating a duplicate row on boot.
      let settings = await (prisma as any).settings.findFirst({ where: { organizationId: null } });
      if (!settings) {
        settings = await (prisma as any).settings.findFirst();
      }

      // If no settings exist, create default settings
      if (!settings) {
        settings = await (prisma as any).settings.create({
          data: {
            organizationId: null,
            businessName: "Restaurant Name",
            businessEmail: "contact@restaurant.com",
            businessPhone: "+1234567890",
            businessAddress: "123 Main Street, City, State",
            timezone: null,
            taxPercentage: 8.5,
            serviceTaxPercentage: 0.0,
            deliveryTaxPercentage: 8.5,
            deliveryFee: 3.99,
            minimumOrderAmount: 15.0,
            currency: "USD",
            taxInclusive: false,
            orderPreparationTime: 30,
            maxOrderQuantity: 10,
            pickupEnabled: true,
            deliveryEnabled: true,
            deliveryRadius: 5.0,
            deliveryTimeEstimate: 45,
            enableFreeDelivery: false,
            freeDeliveryThreshold: 50.0,
            acceptCash: true,
            acceptCard: true,
            acceptOnlinePayment: true,
            acceptPayPal: false,
            pickupAcceptCash: true,
            pickupAcceptCard: true,
            pickupAcceptOnlinePayment: true,
            pickupAcceptPayPal: false,
            appStatus: "LIVE" as AppStatus,
            futureOrdersEnabled: false,
            scheduledOrderTimeSlotInterval: 30,
            scheduledOrderMaxOrdersPerSlot: null,
          } as any,
        });
      }

      // Ensure Decimal fields are properly serialized to numbers/strings
      const serializedSettings = {
        ...settings,
        latitude: settings.latitude ? Number(settings.latitude) : null,
        longitude: settings.longitude ? Number(settings.longitude) : null,
        publicAppUrl,
      };

      const branchId = req.query.branchId as string | undefined;
      if (branchId) {
        const branch = await prisma2.branch.findUnique({
          where: { id: branchId },
          select: {
            id: true,
            isActive: true,
            organizationId: true,
            organization: { select: { isActive: true } as any } as any,
          } as any,
        });

        if (
          !branch ||
          (branch as any).isActive === false ||
          ((branch as any).organizationId && (branch as any).organization?.isActive === false)
        ) {
          res.status(404).json({ success: false, error: "Branch not found" });
          return;
        }

        const organizationId = branch?.organizationId || null;
        if (organizationId) {
          // Organization-level settings overrides are stored as a Settings row
          // linked by organizationId.
          const orgSettings = await (prisma2 as any).settings.findUnique({
            where: { organizationId },
          });

          if (orgSettings) {
            const merged = {
              ...serializedSettings,
              businessName: orgSettings.businessName ?? serializedSettings.businessName,
              businessEmail: orgSettings.businessEmail ?? serializedSettings.businessEmail,
              businessPhone: orgSettings.businessPhone ?? serializedSettings.businessPhone,
              businessAddress: orgSettings.businessAddress ?? serializedSettings.businessAddress,
              timezone: orgSettings.timezone ?? serializedSettings.timezone,
              serviceType: orgSettings.serviceType ?? serializedSettings.serviceType,
              businessLogo: orgSettings.businessLogo ?? serializedSettings.businessLogo,

              currency: orgSettings.currency ?? serializedSettings.currency,
              taxPercentage: orgSettings.taxPercentage ?? serializedSettings.taxPercentage,
              serviceTaxPercentage: orgSettings.serviceTaxPercentage ?? serializedSettings.serviceTaxPercentage,
              deliveryTaxPercentage: orgSettings.deliveryTaxPercentage ?? serializedSettings.deliveryTaxPercentage,
              taxInclusive: orgSettings.taxInclusive ?? serializedSettings.taxInclusive,

              appStatus: orgSettings.appStatus ?? serializedSettings.appStatus,
              allowExcludeOptionalIngredients:
                orgSettings.allowExcludeOptionalIngredients ?? serializedSettings.allowExcludeOptionalIngredients,
              orderMergeTimeframeMinutes:
                orgSettings.orderMergeTimeframeMinutes ?? serializedSettings.orderMergeTimeframeMinutes,
              publicAppUrl,
            };

            res.json({
              success: true,
              data: merged,
            });
            return;
          }
        }
      }

      res.json({
        success: true,
        data: serializedSettings,
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch settings",
      });
    }
  }

  // Assign an existing Settings record to an organization (one-time legacy data migration)
  static async assignSettingsToOrganization(req: Request, res: Response) {
    try {
      const settingsId = req.params.id as string | undefined;
      const organizationId = (req.body?.organizationId as string | undefined) || undefined;

      if (!settingsId) {
        res.status(400).json({ success: false, error: "settingsId is required" });
        return;
      }
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma2 = db.getPrisma();

      const organization = await prisma2.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      const settings = await prisma2.$transaction(async (tx) => {
        const legacy = await (tx as any).settings.findUnique({
          where: { id: settingsId },
        });

        if (!legacy) {
          const err: any = new Error("Settings not found");
          err.statusCode = 404;
          throw err;
        }

        const existingForOrg = await (tx as any).settings.findUnique({
          where: { organizationId },
        });

        // If a Settings row already exists for this organization, merge the legacy values
        // into it and delete the legacy row to avoid unique constraint conflicts.
        if (existingForOrg && existingForOrg.id !== settingsId) {
          const mergedData: any = { ...legacy };
          delete mergedData.id;
          delete mergedData.createdAt;
          delete mergedData.updatedAt;
          delete mergedData.organizationId;
          delete mergedData.organization;

          const updated = await (tx as any).settings.update({
            where: { id: existingForOrg.id },
            data: {
              ...mergedData,
              organizationId,
            } as any,
          });

          await (tx as any).settings.delete({
            where: { id: settingsId },
          });

          return updated;
        }

        // Otherwise, assign the legacy row directly.
        return await (tx as any).settings.update({
          where: { id: settingsId },
          data: { organizationId } as any,
        });
      });

      res.json({ success: true, data: settings });
    } catch (error) {
      const statusCode = (error as any)?.statusCode as number | undefined;
      if (statusCode) {
        res.status(statusCode).json({ success: false, error: (error as any)?.message });
        return;
      }
      console.error("Error assigning settings to organization:", error);
      res.status(500).json({
        success: false,
        error: "Failed to assign settings to organization",
      });
    }
  }

  // Update settings
  static async updateSettings(req: Request, res: Response) {
    try {
      const {
        // Business Information
        businessName,
        businessEmail,
        businessPhone,
        businessAddress,
        timezone,
        serviceType,
        businessLogo,
        country,
        state,
        city,
        addressLineOne,
        latitude,
        longitude,

        // Financial Settings
        taxPercentage,
        serviceTaxPercentage,
        deliveryTaxPercentage,
        deliveryFee,
        minimumOrderAmount,
        currency,
        taxInclusive,

        // Order Settings
        orderPreparationTime,
        maxOrderQuantity,
        orderMergeTimeframeMinutes,
        pickupEnabled,
        deliveryEnabled,

        // Future Order Scheduling (master)
        futureOrdersEnabled,

        // Scheduled Order Time Slot Settings
        scheduledOrderTimeSlotInterval,

        // Scheduled Order Capacity
        scheduledOrderMaxOrdersPerSlot,

        // Delivery Settings
        deliveryRadius,
        deliveryRatePerKilometer,
        useDynamicDeliveryFee,
        useTieredDeliveryFee,
        initialDeliveryRange,
        initialDeliveryPrice,
        extendedDeliveryThreshold,
        extendedDeliveryRate,
        deliveryTimeEstimate,
        enableFreeDelivery,
        freeDeliveryThreshold,

        // Payment Settings
        acceptCash,
        acceptCard,
        acceptOnlinePayment,
        acceptPayPal,
        pickupAcceptCash,
        pickupAcceptCard,
        pickupAcceptOnlinePayment,
        pickupAcceptPayPal,

        // Social Media & Contact
        facebookUrl,
        instagramUrl,
        twitterUrl,
        websiteUrl,

        // Application Status
        appStatus,
        
        // Main Branch Configuration
        mainBranchId,
      } = req.body;
      const normalizedAppStatus = sanitizeAppStatus(appStatus);
      const normalizedServiceType = sanitizeServiceType(serviceType);

      // Update global settings only (organizationId = null)
      const existingSettings = await (prisma as any).settings.findFirst({ where: { organizationId: null } });

      // Build update data object, only including fields that are explicitly provided
      const updateData: any = {};

      // Future Order Scheduling (master)
      if (futureOrdersEnabled !== undefined) {
        updateData.futureOrdersEnabled = Boolean(futureOrdersEnabled);
      }

      // Service availability
      if (pickupEnabled !== undefined) {
        updateData.pickupEnabled = Boolean(pickupEnabled);
      }
      if (deliveryEnabled !== undefined) {
        updateData.deliveryEnabled = Boolean(deliveryEnabled);
      }

      // Scheduled Order Capacity (null/empty = unlimited)
      if (scheduledOrderMaxOrdersPerSlot !== undefined) {
        if (scheduledOrderMaxOrdersPerSlot === null || scheduledOrderMaxOrdersPerSlot === "") {
          updateData.scheduledOrderMaxOrdersPerSlot = null;
        } else {
          const parsed = parseInt(String(scheduledOrderMaxOrdersPerSlot), 10);
          updateData.scheduledOrderMaxOrdersPerSlot = Number.isFinite(parsed) ? parsed : null;
        }
      }

      // Business Information
      if (businessName !== undefined) updateData.businessName = businessName;
      if (businessEmail !== undefined) updateData.businessEmail = businessEmail;
      if (businessPhone !== undefined) updateData.businessPhone = businessPhone;
      if (businessAddress !== undefined)
        updateData.businessAddress = businessAddress;
      if (timezone !== undefined) updateData.timezone = timezone || null;
      if (normalizedServiceType !== undefined) {
        updateData.serviceType = normalizedServiceType;
      }
      if (businessLogo !== undefined) updateData.businessLogo = businessLogo;

      // Application Status
      if (normalizedAppStatus !== undefined) {
        updateData.appStatus = normalizedAppStatus;
      }
      
      // Main Branch Configuration
      if (mainBranchId !== undefined) {
        // Convert empty string, "none", or falsy values to null
        if (mainBranchId === null || mainBranchId === "" || mainBranchId === "none") {
          updateData.mainBranchId = null;
        } else if (typeof mainBranchId === "string" && mainBranchId.trim() !== "") {
          updateData.mainBranchId = mainBranchId.trim();
        } else {
          updateData.mainBranchId = null;
        }
      }

      // Address Information
      if (country !== undefined) updateData.country = country || null;
      if (state !== undefined) updateData.state = state || null;
      if (city !== undefined) updateData.city = city || null;
      if (addressLineOne !== undefined)
        updateData.addressLineOne = addressLineOne || null;
      if (latitude !== undefined) {
        const latValue =
          latitude !== null && latitude !== ""
            ? parseFloat(String(latitude))
            : null;
        updateData.latitude =
          latValue !== null && !isNaN(latValue) ? latValue : null;
      }
      if (longitude !== undefined) {
        const lngValue =
          longitude !== null && longitude !== ""
            ? parseFloat(String(longitude))
            : null;
        updateData.longitude =
          lngValue !== null && !isNaN(lngValue) ? lngValue : null;
      }

      let settings;
      if (existingSettings) {
        // Build the complete update payload
        const completeUpdateData = {
            ...updateData,
            // Financial Settings
            ...(taxPercentage !== undefined && {
              taxPercentage: parseFloat(taxPercentage),
            }),
            ...(serviceTaxPercentage !== undefined && {
              serviceTaxPercentage: parseFloat(serviceTaxPercentage),
            }),
            ...(deliveryTaxPercentage !== undefined && {
              deliveryTaxPercentage: parseFloat(deliveryTaxPercentage),
            }),
            ...(deliveryFee !== undefined && {
              deliveryFee: parseFloat(deliveryFee),
            }),
            ...(minimumOrderAmount !== undefined && {
              minimumOrderAmount: parseFloat(minimumOrderAmount),
            }),
            ...(currency !== undefined && { currency }),
            ...(taxInclusive !== undefined && { taxInclusive }),
            // Order Settings
            ...(orderPreparationTime !== undefined && {
              orderPreparationTime: parseInt(orderPreparationTime),
            }),
            ...(maxOrderQuantity !== undefined && {
              maxOrderQuantity: parseInt(maxOrderQuantity),
            }),
            ...(orderMergeTimeframeMinutes !== undefined && {
              orderMergeTimeframeMinutes: parseInt(orderMergeTimeframeMinutes),
            }),

            // Scheduled Order Time Slot Settings
            ...(scheduledOrderTimeSlotInterval !== undefined && {
              scheduledOrderTimeSlotInterval: parseInt(scheduledOrderTimeSlotInterval),
            }),
            // Delivery Settings
            ...(deliveryRadius !== undefined && {
              deliveryRadius: parseFloat(deliveryRadius),
            }),
            ...(deliveryRatePerKilometer !== undefined && {
              deliveryRatePerKilometer: parseFloat(deliveryRatePerKilometer),
            }),
            ...(useDynamicDeliveryFee !== undefined && {
              useDynamicDeliveryFee,
            }),
            ...(useTieredDeliveryFee !== undefined && {
              useTieredDeliveryFee,
            }),
            ...(initialDeliveryRange !== undefined && {
              initialDeliveryRange: parseFloat(initialDeliveryRange),
            }),
            ...(initialDeliveryPrice !== undefined && {
              initialDeliveryPrice: parseFloat(initialDeliveryPrice),
            }),
            ...(extendedDeliveryThreshold !== undefined && {
              extendedDeliveryThreshold:
                extendedDeliveryThreshold !== null &&
                extendedDeliveryThreshold !== "" &&
                parseFloat(String(extendedDeliveryThreshold)) > 0
                  ? parseFloat(String(extendedDeliveryThreshold))
                  : null,
            }),
            ...(extendedDeliveryRate !== undefined && {
              extendedDeliveryRate:
                extendedDeliveryRate !== null &&
                extendedDeliveryRate !== "" &&
                parseFloat(String(extendedDeliveryRate)) > 0
                  ? parseFloat(String(extendedDeliveryRate))
                  : null,
            }),
            ...(deliveryTimeEstimate !== undefined && {
              deliveryTimeEstimate: parseInt(deliveryTimeEstimate),
            }),
            ...(enableFreeDelivery !== undefined && {
              enableFreeDelivery,
            }),
            ...(freeDeliveryThreshold !== undefined && {
              freeDeliveryThreshold: parseFloat(freeDeliveryThreshold),
            }),
            // Payment Settings
            ...(acceptCash !== undefined && { acceptCash: Boolean(acceptCash) }),
            ...(acceptCard !== undefined && { acceptCard: Boolean(acceptCard) }),
            ...(acceptOnlinePayment !== undefined && { acceptOnlinePayment: Boolean(acceptOnlinePayment) }),
            ...(acceptPayPal !== undefined && (() => {
              const payPalValue = Boolean(acceptPayPal);
              return { acceptPayPal: payPalValue };
            })()),
            ...(pickupAcceptCash !== undefined && {
              pickupAcceptCash: Boolean(pickupAcceptCash),
            }),
            ...(pickupAcceptCard !== undefined && {
              pickupAcceptCard: Boolean(pickupAcceptCard),
            }),
            ...(pickupAcceptOnlinePayment !== undefined && {
              pickupAcceptOnlinePayment: Boolean(pickupAcceptOnlinePayment),
            }),
            ...(pickupAcceptPayPal !== undefined && {
              pickupAcceptPayPal: Boolean(pickupAcceptPayPal),
            }),
            ...(normalizedAppStatus !== undefined && {
              appStatus: normalizedAppStatus,
            }),
            // Social Media & Contact
            ...(facebookUrl !== undefined && { facebookUrl }),
            ...(instagramUrl !== undefined && { instagramUrl }),
            ...(twitterUrl !== undefined && { twitterUrl }),
            ...(websiteUrl !== undefined && { websiteUrl }),
          };
        settings = await (prisma as any).settings.update({
          where: { id: existingSettings.id },
          data: completeUpdateData,
        });
      } else {
        // Create new settings
        settings = await (prisma as any).settings.create({
          data: {
            ...updateData,
            organizationId: null,
          },
        });
      }

      await AuditLogService.writeSafe({
        action: "SETTINGS_UPDATE",
        entityType: "Settings",
        entityId: settings?.id || null,
        scope: { organizationId: null, branchId: null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existingSettings,
        after: settings,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        data: settings,
        message: "Settings updated successfully",
      });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update settings",
      });
    }
  }

  // Reset settings to defaults
  static async resetSettings(req: Request, res: Response) {
    try {
      const existingSettings = await (prisma as any).settings.findFirst({ where: { organizationId: null } });

      const defaultSettings = {
        businessName: "Restaurant Name",
        businessEmail: "contact@restaurant.com",
        businessPhone: "+1234567890",
        businessAddress: "123 Main Street, City, State",
        timezone: null,
        taxPercentage: 8.5,
        serviceTaxPercentage: 0.0,
        deliveryTaxPercentage: 8.5,
        deliveryFee: 3.99,
        minimumOrderAmount: 15.0,
        currency: "USD",
        taxInclusive: false,
        orderPreparationTime: 30,
        maxOrderQuantity: 10,
        pickupEnabled: true,
        deliveryEnabled: true,
        deliveryRadius: 5.0,
        deliveryTimeEstimate: 45,
        enableFreeDelivery: false,
        freeDeliveryThreshold: 50.0,
        acceptCash: true,
        acceptCard: true,
        acceptOnlinePayment: true,
        acceptPayPal: false,
        pickupAcceptCash: true,
        pickupAcceptCard: true,
        pickupAcceptOnlinePayment: true,
        pickupAcceptPayPal: false,
        appStatus: "LIVE" as AppStatus,
      };

      let settings;
      if (existingSettings) {
        settings = await (prisma as any).settings.update({
          where: { id: existingSettings.id },
          data: defaultSettings as any,
        });
      } else {
        settings = await (prisma as any).settings.create({
          data: { organizationId: null, ...(defaultSettings as any) } as any,
        });
      }

      res.json({
        success: true,
        data: settings,
        message: "Settings reset to defaults successfully",
      });
    } catch (error) {
      console.error("Error resetting settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reset settings",
      });
    }
  }
}
