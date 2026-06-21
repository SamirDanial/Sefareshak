import { PrismaClient } from "@prisma/client";

/**
 * Migration script to bootstrap multi-branch support.
 *
 * Steps:
 * 1. Create a main branch from existing Settings (if none exists).
 * 2. Copy Settings data into the main branch (nullable fields preserved).
 * 3. Assign all existing orders to the main branch.
 * 4. Initialize all meals with an empty excludedBranches array if null.
 */
async function migrate() {
  const prisma = new PrismaClient();

  try {
    console.log("Starting multi-branch migration...");

    // 1) Load settings (must exist)
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new Error("Settings record not found. Please create settings before migration.");
    }

    // 2) Create main branch if not exists
    let mainBranch = await prisma.branch.findFirst({
      where: { isMainBranch: true },
    });

    if (!mainBranch) {
      mainBranch = await prisma.branch.create({
        data: {
          name: settings.businessName || "Main Branch",
          isMainBranch: true,
          isActive: true,

          // Location
          address: settings.addressLineOne,
          city: settings.city,
          state: settings.state,
          zipCode: null, // zip not present in settings; keep null
          country: settings.country,
          latitude: settings.latitude ?? null,
          longitude: settings.longitude ?? null,

          // Business info
          businessName: settings.businessName,
          businessEmail: settings.businessEmail,
          businessPhone: settings.businessPhone,
          businessAddress: settings.businessAddress,
          businessLogo: settings.businessLogo,

          // Contact
          phone: settings.businessPhone,
          email: settings.businessEmail,

          // Configuration (nullable overrides)
          deliveryRadius: settings.deliveryRadius,
          deliveryFee: settings.deliveryFee,
          deliveryRatePerKilometer: settings.deliveryRatePerKilometer,
          useDynamicDeliveryFee: settings.useDynamicDeliveryFee,
          useTieredDeliveryFee: settings.useTieredDeliveryFee,
          initialDeliveryRange: settings.initialDeliveryRange,
          initialDeliveryPrice: settings.initialDeliveryPrice,
          extendedDeliveryThreshold: settings.extendedDeliveryThreshold,
          extendedDeliveryRate: settings.extendedDeliveryRate,
          deliveryTimeEstimate: settings.deliveryTimeEstimate,
          enableFreeDelivery: settings.enableFreeDelivery,
          freeDeliveryThreshold: settings.freeDeliveryThreshold,
          taxPercentage: settings.taxPercentage,
          deliveryTaxPercentage: settings.deliveryTaxPercentage,
          enableMinimumOrder: settings.enableMinimumOrder,
          minimumOrderAmount: settings.minimumOrderAmount,
          currency: settings.currency,
          taxInclusive: settings.taxInclusive,
          orderPreparationTime: settings.orderPreparationTime,
          maxOrderQuantity: settings.maxOrderQuantity,
          allowExcludeOptionalIngredients: settings.allowExcludeOptionalIngredients,
          acceptCash: settings.acceptCash,
          acceptCard: settings.acceptCard,
          acceptOnlinePayment: settings.acceptOnlinePayment,
          allowOrdersOutsideHours: settings.allowOrdersOutsideHours,
          // Serving hours
          mondayIsOff: settings.mondayIsOff,
          mondayOpen: settings.mondayOpen,
          mondayClose: settings.mondayClose,
          mondayPeriods: settings.mondayPeriods,
          tuesdayIsOff: settings.tuesdayIsOff,
          tuesdayOpen: settings.tuesdayOpen,
          tuesdayClose: settings.tuesdayClose,
          tuesdayPeriods: settings.tuesdayPeriods,
          wednesdayIsOff: settings.wednesdayIsOff,
          wednesdayOpen: settings.wednesdayOpen,
          wednesdayClose: settings.wednesdayClose,
          wednesdayPeriods: settings.wednesdayPeriods,
          thursdayIsOff: settings.thursdayIsOff,
          thursdayOpen: settings.thursdayOpen,
          thursdayClose: settings.thursdayClose,
          thursdayPeriods: settings.thursdayPeriods,
          fridayIsOff: settings.fridayIsOff,
          fridayOpen: settings.fridayOpen,
          fridayClose: settings.fridayClose,
          fridayPeriods: settings.fridayPeriods,
          saturdayIsOff: settings.saturdayIsOff,
          saturdayOpen: settings.saturdayOpen,
          saturdayClose: settings.saturdayClose,
          saturdayPeriods: settings.saturdayPeriods,
          sundayIsOff: settings.sundayIsOff,
          sundayOpen: settings.sundayOpen,
          sundayClose: settings.sundayClose,
          sundayPeriods: settings.sundayPeriods,
          appStatus: settings.appStatus,

          // Social
          facebookUrl: settings.facebookUrl,
          instagramUrl: settings.instagramUrl,
          twitterUrl: settings.twitterUrl,
          websiteUrl: settings.websiteUrl,
        },
      });

      console.log("Created main branch:", mainBranch.id);
    } else {
      console.log("Main branch already exists:", mainBranch.id);
    }

    // 3) Assign all existing orders to main branch (if missing)
    await prisma.order.updateMany({
      data: { branchId: mainBranch.id },
    });
    console.log("Updated orders to reference main branch");

    // 4) Initialize meals excludedBranches if null
    await prisma.$executeRawUnsafe(
      `UPDATE "meals" SET "excludedBranches" = '{}' WHERE "excludedBranches" IS NULL`
    );
    console.log("Initialized excludedBranches for meals");

    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute if run directly
if (require.main === module) {
  migrate();
}

export default migrate;

