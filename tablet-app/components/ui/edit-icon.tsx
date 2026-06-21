import React from "react";
import { View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface EditIconProps {
  color?: string;
  size?: number;
  style?: any;
  /**
   * If true, wraps the icon in a container View to ensure proper rendering on iOS.
   * This is especially important in bottom sheets and modals.
   * Defaults to true to match the working implementation pattern.
   */
  withContainer?: boolean;
}

/**
 * A reusable EditIcon component that handles platform-specific icon names.
 * On iOS, uses "pencil" for better compatibility.
 * On Android/web, uses "pencil.fill" for consistency.
 * 
 * The component includes a container View by default to ensure proper rendering on iOS,
 * especially in contexts like bottom sheets where icons might not render correctly.
 * This matches the pattern used in the working branch-specific prices implementation.
 */
export function EditIcon({ 
  color = "#ec4899", 
  size = 18,
  style,
  withContainer = true,
}: EditIconProps) {
  const icon = (
    <MaterialCommunityIcons
      name="pencil"
      size={size}
      color={color}
      style={style}
    />
  );

  if (!withContainer) {
    return icon;
  }

  // Container matches the working implementation pattern from branch-specific prices
  return (
    <View 
      style={[
        styles.container,
        {
          width: size,
          height: size,
        },
      ]}
      pointerEvents="none"
    >
      {icon}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
});

