/**
 * location.csv
 *
 * TODO: Not yet implemented as a standalone builder.
 * location.csv (LOC_*) fields are currently submitted as part of the cash_register
 * payload via cashRegisterBuilder.ts (body.location). If Fiskaly requires location
 * data as a separate entity in the closing payload, implement here.
 */
export function buildLocation(): Record<string, any> {
  return {};
}
