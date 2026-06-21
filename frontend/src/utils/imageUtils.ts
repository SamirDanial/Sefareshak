/**
 * Image optimization utilities for frontend
 */

const normalizeOrigin = (value: string) => value.replace(/\/$/, "");

const parseEnvOrigins = (raw: unknown): string[] => {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
};

const resolveApiBaseUrl = (): string => {
  const candidates = parseEnvOrigins(import.meta.env.VITE_API_URL as unknown);

  if (typeof window !== "undefined") {
    const current = normalizeOrigin(window.location.origin);

    if (candidates.length === 0) return "";

    const exact = candidates.find((c) => normalizeOrigin(c) === current);
    if (exact) return exact;

    const withoutWww = current.replace(/:\/\/www\./, "://");
    const matchWithoutWww = candidates.find(
      (c) => normalizeOrigin(c).replace(/:\/\/www\./, "://") === withoutWww
    );
    if (matchWithoutWww) return matchWithoutWww;

    return candidates[0];
  }

  return candidates[0] || "http://localhost:3001";
};

// When frontend is served from backend, use relative URLs
// Otherwise, use the configured API URL or default to localhost:3001
const API_BASE_URL = resolveApiBaseUrl();

export interface OptimizedImageUrls {
  original: string;
  thumbnail: string;
  small: string;
  medium: string;
  large: string;
}

export type ImageSize = "thumbnail" | "small" | "medium" | "large" | "original";

/**
 * Check if an image URL is external (not from our uploads)
 */
export const isExternalImage = (url: string): boolean => {
  return url.startsWith("http://") || url.startsWith("https://");
};

/**
 * Get the appropriate image URL based on size and context
 */
export const getOptimizedImageUrl = (
  baseFilename: string,
  _size: ImageSize = "medium",
  baseUrl?: string
): string => {
  // If it's an external URL (starts with http/https), return as-is
  if (
    baseFilename.startsWith("http://") ||
    baseFilename.startsWith("https://")
  ) {
    return baseFilename;
  }

  // Determine the base URL to use
  const defaultBaseUrl = API_BASE_URL
    ? `${API_BASE_URL}/uploads/images`
    : "/uploads/images";
  const imageBaseUrl = baseUrl || defaultBaseUrl;

  // If it starts with /uploads/images/, handle accordingly
  if (baseFilename.startsWith("/uploads/images/")) {
    const filename = baseFilename.replace("/uploads/images/", "");
    // Use relative URL if API_BASE_URL is empty (same origin)
    const finalUrl = API_BASE_URL
      ? `${API_BASE_URL}/uploads/images/${filename}`
      : `/uploads/images/${filename}`;
    return finalUrl;
  }

  // Simple filename - append to base URL
  const finalUrl = `${imageBaseUrl}/${baseFilename}`;
  return finalUrl;
};

/**
 * Generate responsive image srcset for different screen sizes
 */
export const generateImageSrcSet = (
  baseFilename: string,
  baseUrl?: string
): string => {
  // Default baseUrl uses API_BASE_URL or relative path
  const defaultBaseUrl = API_BASE_URL
    ? `${API_BASE_URL}/uploads/images`
    : "/uploads/images";
  const imageBaseUrl = baseUrl || defaultBaseUrl;
  // If it's an external URL, return empty srcset (use single image)
  if (
    baseFilename.startsWith("http://") ||
    baseFilename.startsWith("https://")
  ) {
    return "";
  }

  const sizes = [
    { size: "thumbnail", width: 150 },
    { size: "small", width: 300 },
    { size: "medium", width: 600 },
    { size: "large", width: 1200 },
  ];

  return sizes
    .map(({ size, width }) => {
      const url = getOptimizedImageUrl(
        baseFilename,
        size as ImageSize,
        imageBaseUrl
      );
      return `${url} ${width}w`;
    })
    .join(", ");
};

/**
 * Get the best image size for a given container width
 */
export const getBestImageSize = (containerWidth: number): ImageSize => {
  if (containerWidth <= 150) return "thumbnail";
  if (containerWidth <= 300) return "small";
  if (containerWidth <= 600) return "medium";
  return "large";
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Check if browser supports WebP format
 */
export const supportsWebP = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src =
      "data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA";
  });
};
