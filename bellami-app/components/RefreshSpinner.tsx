import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";

interface RefreshSpinnerProps {
  visible: boolean;
  topOffset: number;
  color?: string;
  size?: "small" | "large";
}

export function RefreshSpinner({
  visible,
  topOffset,
  color = "#ec4899",
  size = "small",
}: RefreshSpinnerProps) {
  if (!visible) return null;

  return (
    <View style={[styles.overlay, { top: topOffset }]}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10000,
    elevation: 10000,
    pointerEvents: "none",
  },
});

