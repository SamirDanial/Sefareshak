import { FiskalyEnvironment, Prisma } from "@prisma/client";

export type FiskalyConfigSnapshot = {
  enabled: boolean;
  environment: FiskalyEnvironment;
};

export async function getFiskalyConfigSnapshot(
  prisma: Prisma.TransactionClient,
  organizationId: string | null | undefined
): Promise<FiskalyConfigSnapshot | null> {
  if (!organizationId) return null;

  const settings = await prisma.settings.findFirst({
    where: { organizationId },
    select: {
      fiskalyEnabled: true,
      fiskalyEnvironment: true,
    },
  });

  if (!settings) return null;

  return {
    enabled: !!settings.fiskalyEnabled,
    environment: settings.fiskalyEnvironment,
  };
}

export function shouldFiscalize(config: FiskalyConfigSnapshot | null): boolean {
  return !!config?.enabled;
}
