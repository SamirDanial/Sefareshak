import DatabaseSingleton from "../config/database";

export class OrgMenuBackfillService {
  private static instance: OrgMenuBackfillService;

  public static getInstance(): OrgMenuBackfillService {
    if (!OrgMenuBackfillService.instance) {
      OrgMenuBackfillService.instance = new OrgMenuBackfillService();
    }
    return OrgMenuBackfillService.instance;
  }

  private constructor() {}

  public async ensureDefaultOrganizationAndBackfillMenu(): Promise<void> {
    const db = DatabaseSingleton.getInstance();
    const prisma = db.getPrisma() as any;

    // Ensure default org exists (idempotent)
    const defaultOrg = await prisma.organization.upsert({
      where: { slug: "default" },
      update: {},
      create: {
        name: "Default Organization",
        slug: "default",
        isActive: true,
      },
      select: { id: true },
    });

    const defaultOrgId = defaultOrg.id as string;

    // Backfill in a transaction for consistency
    await prisma.$transaction(async (tx: any) => {
      // Categories first
      await tx.category.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrgId },
      });

      // Meals: prefer category orgId (post-backfill it will be defaultOrgId), then fallback.
      // Prisma can't do UPDATE ... FROM via updateMany, so use SQL.
      await tx.$executeRaw`
        UPDATE "meals" m
        SET "organizationId" = COALESCE(c."organizationId", ${defaultOrgId})
        FROM "categories" c
        WHERE m."organizationId" IS NULL
          AND m."categoryId" = c."id";
      `;
      await tx.meal.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrgId },
      });

      // Deals: same approach
      await tx.$executeRaw`
        UPDATE "deals" d
        SET "organizationId" = COALESCE(c."organizationId", ${defaultOrgId})
        FROM "categories" c
        WHERE d."organizationId" IS NULL
          AND d."categoryId" = c."id";
      `;
      await tx.deal.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrgId },
      });

      // Addons / declarations / optional ingredients: set to default if missing
      await tx.addOn.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrgId },
      });

      await tx.declaration.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrgId },
      });

      await tx.optionalIngredient.updateMany({
        where: { organizationId: null },
        data: { organizationId: defaultOrgId },
      });
    });
  }
}
