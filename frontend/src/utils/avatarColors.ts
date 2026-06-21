// Predefined palette of visually distinct, accessible colors
const AVATAR_COLORS = [
  '#F87171', // red
  '#FB923C', // orange
  '#FBBF24', // amber
  '#A3E635', // lime
  '#34D399', // emerald
  '#22D3EE', // cyan
  '#60A5FA', // blue
  '#A78BFA', // violet
  '#F472B6', // pink
  '#EC4899', // fuchsia
  '#8B5CF6', // purple
  '#06B6D4', // teal
];

// Simple hash function to convert string to number
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

/**
 * Get a consistent avatar background color based on a unique identifier.
 * The same identifier will always return the same color.
 * 
 * @param identifier - A unique string identifier (e.g., user ID, email)
 * @returns A hex color string
 */
export const getAvatarColor = (identifier: string): string => {
  const hash = hashString(identifier);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

