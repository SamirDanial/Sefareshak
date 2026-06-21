import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity } from "react-native";

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  visible: boolean;
  onHide: () => void;
  topOffset?: number; // For stacking multiple toasts
}

export function Toast({
  message,
  type,
  visible,
  onHide,
  topOffset = 60,
}: ToastProps) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideWithAnimation = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onHide();
    });
  };

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 8,
      }).start();

      // Hide after ~2.5 seconds
      timerRef.current = setTimeout(() => {
        hideWithAnimation();
      }, 2500);

      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    }
  }, [visible]);

  if (!visible) return null;

  const backgroundColor =
    type === "success"
      ? "rgba(34, 197, 94, 0.95)"
      : type === "error"
      ? "rgba(239, 68, 68, 0.95)"
      : "rgba(59, 130, 246, 0.95)";

  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor, top: topOffset },
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity style={styles.closeButton} onPress={hideWithAnimation}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10000, // Higher than navbar (1000-1001)
    zIndex: 10000, // Higher than navbar (1000-1001)
  },
  icon: {
    fontSize: 20,
    color: "#fff",
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  closeButton: {
    marginLeft: 12,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  closeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
