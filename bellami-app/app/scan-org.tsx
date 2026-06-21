import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useBranch } from "@/src/contexts/BranchContext";

let CameraView: any;
let useCameraPermissions: any;

try {
  const expoCamera = require("expo-camera");
  CameraView = expoCamera.CameraView;
  useCameraPermissions = expoCamera.useCameraPermissions;
} catch {
  // expo-camera not available; will show fallback UI
}

const extractOrganizationSlug = (raw: string): string | null => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("bellamiapp://")) {
      const url = new URL(trimmed);
      const v =
        (url.searchParams.get("org") ||
          url.searchParams.get("organizationSlug") ||
          url.searchParams.get("organization") ||
          "")
          .trim();
      return v || null;
    }
  } catch {
    // ignore
  }

  try {
    if (trimmed.includes("org=") || trimmed.includes("organizationSlug=") || trimmed.includes("organization=")) {
      const url = new URL(`https://placeholder.local/?${trimmed.replace(/^\?/, "")}`);
      const v =
        (url.searchParams.get("org") ||
          url.searchParams.get("organizationSlug") ||
          url.searchParams.get("organization") ||
          "")
          .trim();
      return v || null;
    }
  } catch {
    // ignore
  }

  return trimmed;
};

export default function ScanOrgScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setCustomerOrganizationSlug } = useBranch();

  const permissionHookResult = useCameraPermissions ? useCameraPermissions() : undefined;
  const permission = Array.isArray(permissionHookResult) ? permissionHookResult[0] : null;
  const requestPermission = Array.isArray(permissionHookResult) ? permissionHookResult[1] : null;
  const [isHandlingScan, setIsHandlingScan] = useState(false);
  const handledRef = useRef(false);

  const topInset = useMemo(() => (Platform.OS === "ios" ? insets.top : insets.top), [insets.top]);

  const onClose = useCallback(() => {
    try {
      router.back();
    } catch {
      router.replace("/");
    }
  }, [router]);

  const onScanned = useCallback(
    async (result: any) => {
      if (handledRef.current) return;
      handledRef.current = true;
      setIsHandlingScan(true);

      const org = extractOrganizationSlug(result?.data || "");
      if (!org) {
        handledRef.current = false;
        setIsHandlingScan(false);
        return;
      }

      try {
        setCustomerOrganizationSlug(org);
      } catch {
        // ignore
      }

      try {
        router.replace("/");
      } catch {
        router.push("/");
      }
    },
    [router, setCustomerOrganizationSlug]
  );

  // Fallback UI when expo-camera is not available
  if (!CameraView || !useCameraPermissions) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.center}>
          <MaterialIcons name="qr-code-scanner" size={64} color="#ec4899" />
          <Text style={styles.title}>Scanner not available</Text>
          <Text style={styles.subtitle}>
            The camera module is missing. Please install expo-camera and rebuild the app.
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#ec4899" />
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.center}>
          <Text style={styles.title}>Camera permission required</Text>
          <Text style={styles.subtitle}>Allow camera access to scan organization QR codes.</Text>
          <TouchableOpacity
            onPress={() => {
              requestPermission?.();
            }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
          <MaterialIcons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={isHandlingScan ? undefined : onScanned}
        />

        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.hint}>Point your camera at the organization QR code</Text>
          {isHandlingScan ? (
            <View style={styles.loadingPill}>
              <ActivityIndicator color="#ec4899" size="small" />
              <Text style={styles.loadingPillText}>Applying…</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#151718",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  cameraWrap: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  hint: {
    marginTop: 18,
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    textAlign: "center",
  },
  loadingPill: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "rgba(21,23,24,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  loadingPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
