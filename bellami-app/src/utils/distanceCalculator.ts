/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers

  return distance;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if a location is within delivery radius
 * @param userLat User's latitude
 * @param userLon User's longitude
 * @param restaurantLat Restaurant's latitude
 * @param restaurantLon Restaurant's longitude
 * @param deliveryRadius Delivery radius in kilometers
 * @returns True if within radius, false otherwise
 */
export function isWithinDeliveryRadius(
  userLat: number,
  userLon: number,
  restaurantLat: number,
  restaurantLon: number,
  deliveryRadius: number
): boolean {
  const distance = calculateDistance(
    userLat,
    userLon,
    restaurantLat,
    restaurantLon
  );
  return distance <= deliveryRadius;
}
