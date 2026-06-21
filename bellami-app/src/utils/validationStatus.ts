import { Organization } from "@/src/services/branchService";

export type ValidationStatus = {
  status: 'valid' | 'grace_period' | 'expired' | 'temporarily_invalid' | 'inactive' | 'no_validation';
  message: string;
  expiresAt?: Date;
};

/**
 * Helper function to determine validation status for an organization
 * Mirrors the logic from the React frontend
 */
export function getValidationStatus(organization: Organization): ValidationStatus {
  // Check if organization is inactive first
  if (!organization.isActive) {
    return { status: 'inactive', message: 'Organization is inactive' };
  }

  // Check if there's no validation data
  if (!organization.validations || organization.validations.length === 0) {
    return { status: 'no_validation', message: 'No validation record found' };
  }

  // Get the latest validation
  const latestValidation = organization.validations[0];
  
  if (!latestValidation) {
    return { status: 'no_validation', message: 'No validation record found' };
  }

  const now = new Date();
  const expiresAt = new Date(latestValidation.expiresAt);
  const gracePeriodEndsAt = new Date(latestValidation.gracePeriodEndsAt);

  // Check if expired
  if (now > expiresAt) {
    // Check if still in grace period
    if (now <= gracePeriodEndsAt) {
      return { status: 'grace_period', message: 'In grace period after expiration' };
    } else {
      return { status: 'expired', message: 'Validation expired' };
    }
  }

  // If validation was manually unvalidated (temporarily invalid) - only if not expired
  if (latestValidation.unvalidatedAt || latestValidation.isActive === false) {
    return { status: 'temporarily_invalid', message: 'Validation temporarily inactive' };
  }

  // Valid
  return { 
    status: 'valid', 
    message: 'Valid', 
    expiresAt 
  };
}

/**
 * Get translation key for validation status
 */
export function getValidationTranslationKey(status: ValidationStatus['status']): string {
  switch (status) {
    case 'inactive':
      return 'admin.dashboard.validation.inactiveOrganizationMessage';
    case 'valid':
      return 'admin.dashboard.validation.validationValidMessage';
    case 'grace_period':
      return 'admin.dashboard.validation.validationGracePeriodMessage';
    case 'expired':
      return 'admin.dashboard.validation.validationExpiredMessage';
    case 'temporarily_invalid':
      return 'admin.dashboard.validation.validationTemporarilyInvalidMessage';
    case 'no_validation':
      return 'admin.dashboard.validation.validationUnvalidatedMessage';
    default:
      return 'admin.dashboard.validation.validationUnvalidatedMessage';
  }
}

/**
 * Get icon for validation status
 */
export function getValidationIcon(status: ValidationStatus['status']): string {
  switch (status) {
    case 'inactive':
      return '⚠️';
    case 'valid':
      return '✅';
    case 'grace_period':
      return '⏰';
    case 'expired':
      return '❌';
    case 'temporarily_invalid':
      return '⚠️';
    case 'no_validation':
      return '⚠️';
    default:
      return '⚠️';
  }
}

/**
 * Get color for validation status
 */
export function getValidationColor(status: ValidationStatus['status']): string {
  switch (status) {
    case 'inactive':
      return '#F97316'; // orange
    case 'valid':
      return '#10B981'; // green
    case 'grace_period':
      return '#F59E0B'; // yellow
    case 'expired':
      return '#EF4444'; // red
    case 'temporarily_invalid':
      return '#F97316'; // orange
    case 'no_validation':
      return '#F97316'; // orange
    default:
      return '#F97316'; // orange
  }
}
