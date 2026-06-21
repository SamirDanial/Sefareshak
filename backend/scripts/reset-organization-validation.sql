-- Reset Organization validation fields after truncating OrganizationValidation table
-- This fixes the data inconsistency where Organization table shows as validated
-- but there are no actual validation records

UPDATE "Organization" 
SET 
  "isValidated" = false,
  "validatedAt" = NULL,
  "validatedBy" = NULL,
  "validationExpiresAt" = NULL,
  "validationNotes" = NULL,
  "gracePeriodEndsAt" = NULL
WHERE "isValidated" = true;

-- Verify the fix
SELECT COUNT(*) as "organizations_reset" FROM "Organization" WHERE "isValidated" = false;
