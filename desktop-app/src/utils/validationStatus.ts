import type { Organization } from "../services/branchService";

export type ValidationStatusResult =
  | { status: "no_validation" }
  | { status: "grace_period" }
  | { status: "expired" }
  | { status: "temporarily_invalid" }
  | { status: "valid"; expiresAt: Date };

export const getValidationStatus = (organization: Organization): ValidationStatusResult => {
  const latest = organization.validations?.[0];

  if (!latest) {
    return { status: "no_validation" };
  }

  const now = new Date();
  const expiresAt = new Date(latest.expiresAt);
  const gracePeriodEndsAt = new Date(latest.gracePeriodEndsAt);

  if (now > expiresAt) {
    if (now <= gracePeriodEndsAt) {
      return { status: "grace_period" };
    }
    return { status: "expired" };
  }

  if (latest.unvalidatedAt || latest.isActive === false) {
    return { status: "temporarily_invalid" };
  }

  return { status: "valid", expiresAt };
};
