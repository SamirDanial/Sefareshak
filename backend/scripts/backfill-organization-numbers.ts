import { PrismaClient } from "@prisma/client";

/**
 * Backfill Organization.organizationNumber with sequential numbers (ORG-0001, ORG-0002, etc.)
 *
 * Idempotent behavior:
 * - Skips organizations that already have organizationNumber set (non-empty).
 * - Assigns sequential numbers to organizations with empty organizationNumber, ordered by createdAt.
 * - Format: ORG- followed by 4-digit zero-padded number (e.g., ORG-0001, ORG-0002).
 */
async function backfillOrganizationNumbers() {
  const prisma = new PrismaClient();

  try {
    console.log("Starting backfill of organizations.organizationNumber...");

    // Get the maximum existing organization number to continue from there
    const existingOrgs = await prisma.organization.findMany({
      where: {
        organizationNumber: {
          not: "",
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

    console.log(`Starting sequence from: ${nextSequence}`);

    // Get all organizations with empty organizationNumber, ordered by createdAt
    const organizations = await prisma.organization.findMany({
      where: {
        organizationNumber: "",
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const org of organizations) {
      const organizationNumber = `ORG-${String(nextSequence).padStart(4, '0')}`;

      try {
        await prisma.organization.update({
          where: { id: org.id },
          data: { organizationNumber },
        });
        console.log(`Updated organization ${org.name} (${org.id}) -> ${organizationNumber}`);
        updated += 1;
        nextSequence += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update organization ${org.id}: ${errorMessage}`);
        errors.push(`${org.id}: ${errorMessage}`);
      }
    }

    // Count organizations that already had a number
    const alreadySetCount = await prisma.organization.count({
      where: {
        organizationNumber: {
          not: "",
        },
      },
    });

    console.log("Backfill complete.");
    console.log(
      JSON.stringify(
        {
          totalOrganizations: organizations.length + alreadySetCount,
          updated,
          skippedExisting: alreadySetCount,
          errors: errors.length,
        },
        null,
        2
      )
    );

    if (errors.length > 0) {
      console.error("Errors encountered:");
      errors.forEach((err) => console.error(`  - ${err}`));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("Backfill failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  backfillOrganizationNumbers();
}

export default backfillOrganizationNumbers;
