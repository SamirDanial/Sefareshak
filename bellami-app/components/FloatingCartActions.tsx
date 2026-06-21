import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/src/store/cartStore";
import { useUser } from "@clerk/clerk-expo";

export default function FloatingCartActions() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useUser();
  const { getTotalItems } = useCartStore();
  const totalItems = getTotalItems();

  if (totalItems <= 0) return null;

  const isCart = pathname === "/cart";
  const isCheckout = pathname === "/checkout";

  const goToMenu = () => router.push("/(tabs)/menu" as any);
  const goToCart = () => router.push("/cart" as any);

  const showAddMoreButton = isCart || isCheckout;
  const showCartButton = !isCart;

  if (!showAddMoreButton && !showCartButton) {
    return null;
  }

  // Keep above the tab bar (and above the iPhone home indicator)
  const bottomOffset = insets.bottom + 90;

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      {showAddMoreButton && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={goToMenu}
          accessibilityLabel={t("floatingActions.addMoreItems")}
          style={[styles.button, styles.addMoreButton]}
        >
          <MaterialIcons name="add" size={18} color="#fff" />
          <Text style={styles.buttonText}>{t("floatingActions.addMoreItems")}</Text>
        </TouchableOpacity>
      )}

      {showCartButton && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={goToCart}
          accessibilityLabel={t("floatingActions.goToCart")}
          style={[styles.button, styles.cartButton]}
        >
          <MaterialIcons name="shopping-cart" size={18} color="#fff" />
          <Text style={styles.buttonText}>{t("common.cart")}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalItems}</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: 16,
    zIndex: 999,
    elevation: 12,
    gap: 10,
    alignItems: "flex-end",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryButton: {
    backgroundColor: "#ec4899",
  },
  cartButton: {
    backgroundColor: "#22c55e",
  },
  addMoreButton: {
    backgroundColor: "#3b82f6",
  },
  secondaryButton: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  badge: {
    marginLeft: 4,
    backgroundColor: "#fff",
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "800",
  },
});
