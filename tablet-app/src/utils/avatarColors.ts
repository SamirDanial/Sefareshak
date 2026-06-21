const AVATAR_COLORS = [
  "#F87171",
  "#FB923C",
  "#FBBF24",
  "#A3E635",
  "#34D399",
  "#22D3EE",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#EC4899",
  "#8B5CF6",
  "#06B6D4",
];

const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

export const getAvatarColor = (identifier: string): string => {
  const hash = hashString(identifier);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};
