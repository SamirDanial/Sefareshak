import { PrismaClient } from "@prisma/client";

/**
 * Backfill User.organizationId based on assigned branches.
 *
 * Idempotent behavior:
 * - Skips users that already have organizationId set.
 * - If a user has branches from multiple organizations, it will NOT set organizationId
 *   and will print the conflict for manual resolution.
 * - If a user has no branches, it will leave organizationId as null.
 */
async function backfillUserOrganization() {
  const prisma = new PrismaClient();

  try {
    console.log("Starting backfill of users.organizationId...");

    const users = await prisma.user.findMany({
      select: {
        id: true,
        clerkId: true,
        email: true,
        organizationId: true,
        assignedBranches: {
          select: {
            branch: {
              select: {
                id: true,
                organizationId: true,
              },
            },
          },
        },
      },
    });

    let updated = 0;
    let skipped = 0;
    let conflicts = 0;

    for (const user of users) {
      if (user.organizationId) {
        skipped += 1;
        continue;
      }

      const orgIds = Array.from(
        new Set(
          user.assignedBranches
            .map((ab: { branch: { organizationId: string | null } }) => ab.branch.organizationId)
            .filter((x: string | null): x is string => !!x)
        )
      );

      if (orgIds.length === 0) {
        // No branches or branches without org -> leave null
        continue;
      }

      if (orgIds.length > 1) {
        conflicts += 1;
        console.warn(
          `[CONFLICT] user ${user.email ?? user.clerkId} (${user.id}) has branches from multiple orgs: ${orgIds.join(", ")}`
        );
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: orgIds[0] },
      });
      updated += 1;
    }

    console.log("Backfill complete.");
    console.log(
      JSON.stringify(
        {
          totalUsers: users.length,
          updated,
          skippedExistingOrg: skipped,
          conflicts,
        },
        null,
        2
      )
    );

    if (conflicts > 0) {
      process.exitCode = 2;
    }
  } catch (e) {
    console.error("Backfill failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  backfillUserOrganization();
}

export default backfillUserOrganization;
