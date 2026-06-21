import { Tabs, usePathname } from "expo-router";
import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useUnseenStatusChanges } from "@/src/contexts/UnseenStatusChangesContext";
import { useBranch } from "@/src/contexts/BranchContext";

export default function TabLayout() {
  const { count } = useUnseenStatusChanges();
  const pathname = usePathname();
  const isScopeRoute = pathname === "/scope" || pathname === "/(tabs)/scope" || pathname.endsWith("/scope");

  const { branch, visibleBranches } = useBranch();
  const selectedBranch = branch?.id ? (visibleBranches as any[]).find((b) => b?.id === branch.id) : null;
  const orgStatus = String((selectedBranch as any)?.organization?.settings?.appStatus || "LIVE").toUpperCase();
  const isOrgUnavailable = orgStatus !== "LIVE";

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: "#ec4899", // Pink
        tabBarInactiveTintColor: "#9BA1A6",
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#151718",
          borderTopColor: "#2a2a2a",
          borderTopWidth: 1,
        },
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              size={24}
              name="home"
              color={focused ? "#ec4899" : "#9BA1A6"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scope"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favorites",
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              size={24}
              name="heart"
              color={focused ? "#ec4899" : "#9BA1A6"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarButton: (props) => <HapticTab {...props} disabled={isScopeRoute || isOrgUnavailable} />,
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              size={24}
              name="silverware-fork-knife"
              color={focused ? "#ec4899" : "#9BA1A6"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "My Orders",
          tabBarButton: (props) => <HapticTab {...props} disabled={isScopeRoute} />,
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                size={24}
                name="shopping"
                color={focused ? "#ec4899" : "#9BA1A6"}
              />
              {count > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {count > 9 ? "9+" : count}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#f97316",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#151718",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
});
