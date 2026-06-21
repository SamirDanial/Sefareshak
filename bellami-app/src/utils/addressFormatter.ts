/**
 * Formats German addresses to place house numbers at the end.
 * German address convention: street name first, then house number.
 * Example: "48 Nürnberger Straße" → "Nürnberger Straße 48"
 * 
 * @param address - The address string to format
 * @returns The formatted address string, or null/undefined if input is null/undefined
 */
export function formatGermanAddress(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }

  if (address.trim() === '') {
    return address;
  }

  // Regex to match leading number(s) followed by space and street name
  // Matches patterns like "48 Nürnberger Straße", "123a Hauptstraße", "1 Berliner Straße"
  const germanAddressRegex = /^(\d+[a-zA-Z]?)\s+(.+)$/;

  const match = address.trim().match(germanAddressRegex);

  if (match) {
    // Reorder to street name + house number
    const [, houseNumber, streetName] = match;
    return `${streetName} ${houseNumber}`;
  }

  // If no match, return address as-is (already correct format or non-German address)
  return address;
}
