import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { type Branch } from "@/src/services/branchService";

type PickupLocationDisplayProps = {
  branch: Branch | null | undefined;
  compact?: boolean;
  settings?: any | null;
};

const parseCoordinate = (coord: any): number | null => {
  if (coord === undefined || coord === null) return null;
  if (typeof coord === "number") return coord;
  const parsed = parseFloat(String(coord));
  return Number.isNaN(parsed) ? null : parsed;
};

export default function PickupLocationDisplay({
  branch,
  compact = false,
  settings,
}: PickupLocationDisplayProps) {
  const { t } = useTranslation();

  const latitude = useMemo(() => parseCoordinate(branch?.latitude), [branch]);
  const longitude = useMemo(() => parseCoordinate(branch?.longitude), [branch]);

  if (!branch) return null;

  // Use branch address fields if available, otherwise fall back to global settings businessAddress
  const addressParts = [
    branch.address,
    branch.city,
    branch.state,
    branch.country,
  ].filter(Boolean);
  const branchAddress = addressParts.join(", ");
  
  const address = branchAddress || settings?.businessAddress || "";

  const openInMaps = () => {
    if (latitude !== null && longitude !== null) {
      const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      Linking.openURL(url);
    }
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <MaterialCommunityIcons name="map-marker-radius" size={18} color="#ec4899" />
        <View style={{ flex: 1 }}>
          <Text style={styles.branchName}>
            {branch.name ||
              t("orders.pickupLocation", { defaultValue: "Pickup Location" })}
          </Text>
          <Text style={styles.branchAddress} numberOfLines={2}>
            {address || t("common.notAvailable", { defaultValue: "N/A" })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="map-marker-radius" size={20} color="#ec4899" />
        <View style={{ flex: 1 }}>
          <Text style={styles.branchName}>
            {branch.name ||
              t("orders.pickupLocation", { defaultValue: "Pickup Location" })}
          </Text>
          <Text style={styles.branchAddress} numberOfLines={3}>
            {address || t("common.notAvailable", { defaultValue: "N/A" })}
          </Text>
        </View>
      </View>
      {latitude !== null && longitude !== null && (
        <TouchableOpacity style={styles.mapButton} onPress={openInMaps}>
          <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#fff" />
          <Text style={styles.mapButtonText}>
            {t("common.openInMaps", "Open in Maps")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  branchName: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 16,
  },
  branchAddress: {
    color: "#6b7280",
    marginTop: 4,
    fontSize: 14,
  },
  mapButton: {
    marginTop: 12,
    backgroundColor: "#ec4899",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mapButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
