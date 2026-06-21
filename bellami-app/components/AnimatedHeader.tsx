import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScroll } from "@/src/contexts/ScrollContext";
import { ReactNode } from "react";

interface AnimatedHeaderProps {
  title: string;
  onBackPress?: () => void;
  rightContent?: ReactNode;
  showStatusBar?: boolean;
  statusBarStyle?: "light" | "dark";
}

// Default status bar style is light for dark backgrounds
const DEFAULT_STATUS_BAR_STYLE: "light" | "dark" = "light";

export function AnimatedHeader({
  title,
  onBackPress,
  rightContent,
  showStatusBar = true,
  statusBarStyle = DEFAULT_STATUS_BAR_STYLE,
}: AnimatedHeaderProps) {
  const insets = useSafeAreaInsets();
  const { isScrollingDown, isAtTop } = useScroll();
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const headerContentHeight = 56; // Compact header height
  const statusBarHeight = insets.top;

  // Animate header content based on scroll direction (status bar stays stable)
  useEffect(() => {
    const shouldShow = isAtTop || !isScrollingDown;

    // Move header up more to fully hide
    Animated.timing(headerTranslateY, {
      toValue: shouldShow ? 0 : -(headerContentHeight + 10), // Extra 10px to fully hide
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isScrollingDown, isAtTop, headerTranslateY, headerContentHeight]);

  return (
    <>
      {showStatusBar && (
        <StatusBar
          barStyle={statusBarStyle === "light" ? "light-content" : "dark-content"}
        />
      )}
      {/* Status Bar Background - Stable */}
      {statusBarHeight > 0 && (
        <View
          style={[styles.statusBarBackground, { height: statusBarHeight }]}
        />
      )}
      {/* Header Content - Animated */}
      <Animated.View
        style={[
          styles.headerContainer,
          {
            top: statusBarHeight, // Position below status bar
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={styles.header}>
          {onBackPress ? (
            <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
              <Text style={styles.backButtonIcon}>‹</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          <View style={styles.headerRight}>{rightContent || <View />}</View>
        </View>
      </Animated.View>
    </>
  );
}

// Export helper to get header height for ScrollView padding
export function getAnimatedHeaderHeight(): number {
  // This will be calculated dynamically, but we export a helper
  // For now, return approximate height
  return 56; // headerContentHeight
}

const styles = StyleSheet.create({
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#151718",
    zIndex: 1001,
  },
  headerContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#151718",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  backButtonIcon: {
    fontSize: 32,
    color: "#ec4899",
    fontWeight: "bold",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
    paddingTop: 6,
    paddingHorizontal: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
  },
});

