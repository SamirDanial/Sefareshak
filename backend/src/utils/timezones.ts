import moment from "moment-timezone";

// Comprehensive list of all IANA timezones using moment-timezone's database
// This provides 400+ timezones including Asia/Kabul and all geographic zones
const EXCLUDED_PREFIXES = ["Etc/", "SystemV/", "GMT", "UCT"];

// Get all IANA timezone names from moment-timezone's comprehensive database
export const getAllTimeZones = (): string[] => {
  try {
    const allZones = moment.tz.names();
    // Filter out system/non-location zones while keeping all geographic zones
    return allZones.filter((zone) => {
      // Keep UTC explicitly
      if (zone === "UTC") return true;
      // Exclude system-only zones
      return !EXCLUDED_PREFIXES.some((prefix) => zone.startsWith(prefix));
    });
  } catch {
    // Fallback to common timezones if moment-timezone fails
    return [
      "UTC",
      "Europe/Berlin",
      "Europe/London",
      "Europe/Paris",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Istanbul",
      "Africa/Cairo",
      "Africa/Johannesburg",
      "Asia/Kabul",
      "Asia/Dubai",
      "Asia/Tehran",
      "Asia/Karachi",
      "Asia/Kolkata",
      "Asia/Dhaka",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Hong_Kong",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Australia/Perth",
      "Australia/Adelaide",
      "Australia/Sydney",
      "Pacific/Auckland",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Toronto",
      "America/Vancouver",
      "America/Mexico_City",
      "America/Sao_Paulo",
      "America/Argentina/Buenos_Aires",
    ];
  }
};

// Validate that a timezone string is a valid IANA timezone
export const isValidTimeZone = (timezone: string): boolean => {
  if (!timezone || typeof timezone !== "string") return false;
  try {
    // Check if moment-timezone recognizes this timezone
    return moment.tz.names().includes(timezone);
  } catch {
    return false;
  }
};

// Get device timezone (server will use UTC or system timezone)
export const getDeviceTimeZone = (): string => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.trim() ? tz.trim() : "UTC";
  } catch {
    return "UTC";
  }
};
