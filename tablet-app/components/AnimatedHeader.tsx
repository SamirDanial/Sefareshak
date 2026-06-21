import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
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
  const headerContentHeight = 56;
  const statusBarHeight = insets.top;

  useEffect(() => {
    const shouldShow = isAtTop || !isScrollingDown;

    Animated.timing(headerTranslateY, {
      toValue: shouldShow ? 0 : -(headerContentHeight + 10),
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isScrollingDown, isAtTop, headerTranslateY]);

  return (
    <>
      {showStatusBar && (
        <StatusBar
          barStyle={statusBarStyle === "light" ? "light-content" : "dark-content"}
        />
      )}
      {statusBarHeight > 0 && (
        <View style={[styles.statusBarBackground, { height: statusBarHeight }]} />
      )}
      <Animated.View
        style={[
          styles.headerContainer,
          {
            top: statusBarHeight,
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

export function getAnimatedHeaderHeight(): number {
  return 56;
}

const styles = StyleSheet.create({
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
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
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
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
    color: "#111827",
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
