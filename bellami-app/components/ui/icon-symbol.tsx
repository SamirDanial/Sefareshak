// Unified icon component using MaterialCommunityIcons across all platforms.

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { type ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

export type IconSymbolName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * An icon component that uses MaterialCommunityIcons on all platforms.
 * This ensures a consistent look across iOS, Android, and web.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color?: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: string;
}) {
  return (
    <MaterialCommunityIcons
      color={color as string}
      size={size}
      name={name}
      style={style}
    />
  );
}
