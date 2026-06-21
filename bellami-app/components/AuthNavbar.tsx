import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Pressable,
  Modal,
  Platform,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter, usePathname } from "expo-router";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { UserMenu } from "./UserMenu";
import { useCartStore } from "@/src/store/cartStore";
import { MaterialIcons } from "@expo/vector-icons";
import LanguageSwitcher from "./LanguageSwitcher";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useGlobalToast } from "@/src/contexts/GlobalToastContext";

export function AuthNavbar() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { showToast } = useGlobalToast();
  const [showMenu, setShowMenu] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [isPreOrderLocked, setIsPreOrderLocked] = useState(false);
  const [storedBranchData, setStoredBranchData] = useState<any>(null);
  const totalItems = useCartStore((state) => state.getTotalItems());
  const { clearCart } = useCartStore();
  const { isScrollingDown, isAtTop } = useScroll();
  const { branch, branches, clearReservationLock, customerOrganizationSlug } = useBranch();
  const translateY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const navbarHeight = 70; // Approximate navbar height (padding 16*2 + content ~40px)
  const statusBarHeight = insets.top;

  // Check for stored branch data from Favorites page (bypasses location filtering)
  useEffect(() => {
    const loadStoredBranchData = async () => {
      try {
        const stored = await AsyncStorage.getItem("selectedBranchData");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.id) {
            setStoredBranchData(parsed);
          }
        }
      } catch (e) {
        console.error("[AuthNavbar] Failed to parse stored branch data:", e);
      }
    };
    loadStoredBranchData();
  }, []);

  const brandTitleParts = React.useMemo(() => {
    // If we have stored branch data from Favorites, use it directly
    if (storedBranchData?.id) {
      const businessName = storedBranchData?.organization?.settings?.businessName;
      const organizationName = storedBranchData?.organization?.name;
      const branchName = storedBranchData?.name;

      const orgName =
        (typeof businessName === "string" && businessName.trim()) ||
        (typeof organizationName === "string" && organizationName.trim()) ||
        null;

      const orgLabelRaw = orgName || null;
      const branchLabelRaw = typeof branchName === "string" && branchName.trim() ? branchName.trim() : null;

      const truncate7 = (s: string | null) => {
        if (!s) return null;
        if (s.length <= 7) return s;
        return s.slice(0, 7) + "...";
      };

      const orgLabel = truncate7(orgLabelRaw);
      const branchLabel = truncate7(branchLabelRaw);

      if (orgLabel && branchLabel) {
        return { orgLabel, branchLabel, title: `${orgLabel}/${branchLabel}` };
      }
      if (orgLabel) return { orgLabel, branchLabel: null, title: orgLabel };
      if (branchLabel) return { orgLabel: null, branchLabel, title: branchLabel };
      return { orgLabel: null, branchLabel: null, title: "" };
    }

    // Otherwise, use normal branch lookup
    const selectedBranch = branch?.id ? (branches.find((b: any) => b?.id === branch.id) as any) : null;
    const businessName = selectedBranch?.organization?.settings?.businessName;
    const organizationName = selectedBranch?.organization?.name;
    const branchName = branch?.name;

    const orgNameFromScope = (() => {
      if (!customerOrganizationSlug) return null;

      const branchWithBusinessName = (branches || []).find(
        (b: any) => (b as any)?.organization?.settings?.businessName
      ) as any;
      const branchWithOrgName = (branches || []).find((b: any) => (b as any)?.organization?.name) as any;

      const candidate =
        branchWithBusinessName?.organization?.settings?.businessName ||
        branchWithOrgName?.organization?.name ||
        "";
      const trimmed = typeof candidate === "string" ? candidate.trim() : "";
      if (trimmed) return trimmed;

      const slug = String(customerOrganizationSlug || "").trim();
      if (!slug) return null;
      return slug
        .replace(/[-_]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    })();
    
    const orgName =
      (typeof businessName === "string" && businessName.trim()) ||
      (typeof organizationName === "string" && organizationName.trim()) ||
      orgNameFromScope ||
      null;
    
    const orgLabelRaw = orgName || null;
    const branchLabelRaw = typeof branchName === "string" && branchName.trim() ? branchName.trim() : null;

    // Truncate to 7 chars + "..." if longer than 7 chars
    const truncate7 = (s: string | null) => {
      if (!s) return null;
      if (s.length <= 7) return s;
      return s.slice(0, 7) + "...";
    };

    const orgLabel = truncate7(orgLabelRaw);
    const branchLabel = truncate7(branchLabelRaw);

    if (orgLabel && branchLabel) {
      return { orgLabel, branchLabel, title: `${orgLabel}/${branchLabel}` };
    }

    if (orgLabel) return { orgLabel, branchLabel: null, title: orgLabel };
    if (branchLabel) return { orgLabel: null, branchLabel, title: branchLabel };
    return { orgLabel: null, branchLabel: null, title: "" };
  }, [branch?.id, branch?.name, branches, customerOrganizationSlug, storedBranchData]);

  const renderBrandTitle = () => {
    const { orgLabel, branchLabel, title } = brandTitleParts;
    if (orgLabel && branchLabel) {
      return (
        <Text style={styles.title} numberOfLines={1}>
          <Text style={styles.titleOrg}>{orgLabel}</Text>
          <Text style={styles.titleSeparator}>/</Text>
          <Text style={styles.titleBranch}>{branchLabel}</Text>
        </Text>
      );
    }

    return (
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    );
  };

  // Check if we're in modification mode
  useEffect(() => {
    const checkModificationMode = async () => {
      const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
      const modifyingReservationBranchId = await AsyncStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderId = await AsyncStorage.getItem("modifyingOrderId");
      const modifyingOrderBranchId = await AsyncStorage.getItem("modifyingOrderBranchId");
      const preOrderBranchLock = await AsyncStorage.getItem("preOrderBranchLock");

      setIsModifying(!!modifyingReservationId || !!modifyingOrderId);
      // Pre-order lock is active if a lock exists OR a modifying branch lock exists (matches BranchSwitcher behavior)
      setIsPreOrderLocked(
        !!preOrderBranchLock || !!modifyingReservationBranchId || !!modifyingOrderBranchId
      );
    };
    
    checkModificationMode();
    
    // Check periodically in case of changes
    const interval = setInterval(checkModificationMode, 500);
    
    return () => clearInterval(interval);
  }, []);

  // Check modification mode when pathname changes (navigation)
  useEffect(() => {
    const checkModificationMode = async () => {
      const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
      const modifyingReservationBranchId = await AsyncStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderId = await AsyncStorage.getItem("modifyingOrderId");
      const modifyingOrderBranchId = await AsyncStorage.getItem("modifyingOrderBranchId");
      const preOrderBranchLock = await AsyncStorage.getItem("preOrderBranchLock");

      setIsModifying(!!modifyingReservationId || !!modifyingOrderId);
      setIsPreOrderLocked(
        !!preOrderBranchLock || !!modifyingReservationBranchId || !!modifyingOrderBranchId
      );
    };
    
    checkModificationMode();
  }, [pathname]);

  // Animate navbar based on scroll direction
  useEffect(() => {
    // Show navbar when at top or scrolling up, hide when scrolling down
    const shouldShow = isAtTop || !isScrollingDown;
    
    Animated.timing(translateY, {
      toValue: shouldShow ? 0 : -navbarHeight,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isScrollingDown, isAtTop, translateY, navbarHeight]);

  const handleLogin = () => {
    router.push("/(auth)/sign-in");
  };

  const handleHomePress = () => {
    try {
      router.replace("/");
    } catch {
      router.push("/");
    }
  };

  const handleCartPress = () => {
    router.push("/cart");
  };

  const handleScanOrgPress = () => {
    (router.push as any)("/scan-org");
  };

  const handleExitModification = async () => {
    // Clear modification mode
    await AsyncStorage.removeItem("modifyingReservationId");
    await AsyncStorage.removeItem("modifyingReservationBranchId");
    await AsyncStorage.removeItem("modifyingOrderId");
    await AsyncStorage.removeItem("modifyingOrderBranchId");
    
    // Clear cart
    clearCart();
    
    // Show toast
    showToast(
      t("reservations.myReservations.modification.exited") || "Reservation editing cancelled. Cart cleared.",
      "info"
    );
    
    // Navigate to home
    try {
      router.replace("/");
    } catch {
      router.push("/");
    }
    
    // Update state
    setIsModifying(false);
  };

  const handleExitPreOrder = async () => {
    await clearReservationLock();
    showToast(
      t("reservations.booking.preOrderCancelled") || "Pre-order cancelled. Branch unlocked.",
      "info"
    );
    setIsPreOrderLocked(false);
    // Use root as the safest home route to avoid 404s
    try {
      router.replace("/");
    } catch {
      router.push("/");
    }
  };

  // Render navbar with animation wrapper
  const renderNavbar = (content: React.ReactNode) => (
    <>
      {/* Status Bar - Show on all platforms with light content */}
      <StatusBar style="light" />
      {/* Status Bar Background - Stable */}
      {statusBarHeight > 0 && (
        <View
          style={[styles.statusBarBackground, { height: statusBarHeight }]}
        />
      )}
      {/* Navbar Content - Animated */}
      <Animated.View
        style={[
          styles.navbarContainer,
          {
            top: statusBarHeight, // Position below status bar
            transform: [{ translateY }],
          },
        ]}
      >
        {content}
      </Animated.View>
    </>
  );

  // Show loading state while Clerk is initializing
  if (!isLoaded || !userLoaded) {
    return renderNavbar(
      <View style={styles.navbar}>
        <TouchableOpacity onPress={handleHomePress} activeOpacity={0.8} accessibilityRole="button">
          {renderBrandTitle()}
        </TouchableOpacity>
        <View style={styles.rightContainer}>
          <LanguageSwitcher />
          <View style={styles.spacer} />
          <TouchableOpacity style={styles.iconButton} onPress={handleScanOrgPress}>
            <MaterialIcons name="qr-code-scanner" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
            <MaterialIcons name="shopping-cart" size={16} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isSignedIn) {
    return renderNavbar(
      <View style={styles.navbar}>
        <TouchableOpacity onPress={handleHomePress} activeOpacity={0.8} accessibilityRole="button">
          {renderBrandTitle()}
        </TouchableOpacity>
        <View style={styles.rightContainer}>
          <LanguageSwitcher />
          <View style={styles.spacer} />
          <TouchableOpacity style={styles.iconButton} onPress={handleScanOrgPress}>
            <MaterialIcons name="qr-code-scanner" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
            <MaterialIcons name="shopping-cart" size={16} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return renderNavbar(
    <View style={styles.navbar}>
      <TouchableOpacity onPress={handleHomePress} activeOpacity={0.8} accessibilityRole="button">
        {renderBrandTitle()}
      </TouchableOpacity>
      <View style={styles.rightContainer}>
        {/* Exit Modification Mode Button - Only show when modifying */}
        {isModifying && (
          <>
            <TouchableOpacity
              style={styles.cancelEditingButton}
              onPress={handleExitModification}
            >
              <MaterialIcons name="close" size={16} color="#fff" />
              <Text style={styles.cancelEditingButtonText}>
                {t("reservations.myReservations.modification.exit") || "Cancel Editing"}
              </Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
          </>
        )}
        <LanguageSwitcher />
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.iconButton} onPress={handleScanOrgPress}>
          <MaterialIcons name="qr-code-scanner" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
          <MaterialIcons name="shopping-cart" size={16} color="#fff" />
          {totalItems > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{totalItems}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity onPress={() => setShowMenu(!showMenu)}>
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user?.firstName?.charAt(0) ||
                  user?.primaryEmailAddress?.emailAddress
                    ?.charAt(0)
                    .toUpperCase() ||
                  "?"}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuWrapper}>
            <UserMenu onClose={() => setShowMenu(false)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#151718",
    zIndex: 1001,
  },
  navbarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  navbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#151718",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ECEDEE",
    letterSpacing: 0.5,
  },
  titleOrg: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ECEDEE",
    letterSpacing: 0.5,
  },
  titleSeparator: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ECEDEE",
    letterSpacing: 0.5,
  },
  titleBranch: {
    fontSize: 14,
    fontWeight: "800",
    color: "#B6BBC0",
    letterSpacing: 0.25,
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
  },
  spacer: {
    width: 12,
  },
  cartButton: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#252729",
    justifyContent: "center",
    alignItems: "center",
  },
  iconButton: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#252729",
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#fff",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#ec4899",
  },
  loginButtonText: {
    color: "#9BA1A6",
    fontSize: 16,
    fontWeight: "600",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#e5e5e5",
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2a2a2a",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelEditingButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  cancelEditingButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  cancelLockButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  cancelLockButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 20,
  },
  menuWrapper: {
    alignItems: "flex-end",
  },
});
