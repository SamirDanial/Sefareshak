import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import ApiService from "@/src/services/apiService";
import { useBranch } from "@/src/contexts/BranchContext";
import { formatPrice, fetchPublicSettings } from "@/src/utils/currency";
import AppStatusNotice from "@/components/AppStatusNotice";
import { MaterialIcons } from "@expo/vector-icons";
import { useCartStore } from "@/src/store/cartStore";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/800x800?text=Deals";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

const getDealTotal = (deal: any): number => {
  const components = Array.isArray(deal?.components) ? deal.components : [];
  return components.reduce((sum: number, c: any) => {
    const v = c?.effectivePrice ?? c?.price;
    const n = typeof v === "number" ? v : parseFloat(String(v || 0));
    const q = c?.quantity !== undefined && c?.quantity !== null ? Number(c.quantity) : 1;
    const qty = Number.isFinite(q) && q > 0 ? q : 1;
    return sum + (isNaN(n) ? 0 : n) * qty;
  }, 0);
};

export default function DealCategoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === "ios" ? insets.top : 0;
  const { branch, customerOrganizationSlug, visibleBranches } = useBranch();
  const { getTotalItems } = useCartStore();
  const totalItems = getTotalItems();

  const selectedBranch = branch?.id
    ? (visibleBranches as any[]).find((b: any) => b?.id === branch.id)
    : null;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase();
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";

  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const [category, setCategory] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>("USD");
  const [appStatus, setAppStatus] = useState<string>("LIVE");
  const [settingsLoading, setSettingsLoading] = useState(true);

  const scrollRef = useRef<ScrollView>(null);

  const orderedDeals = useMemo(() => {
    return [...deals].sort((a: any, b: any) => {
      const orderA =
        typeof a?.listOrder === "number" && a.listOrder > 0
          ? a.listOrder
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b?.listOrder === "number" && b.listOrder > 0
          ? b.listOrder
          : Number.MAX_SAFE_INTEGER;

      if (orderA === orderB) {
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      }
      return orderA - orderB;
    });
  }, [deals]);

  const fetchSettings = async () => {
    if (isOrganizationUnavailable) {
      setAppStatus(organizationAppStatus);
      setSettingsLoading(false);
      return;
    }
    const settings = await fetchPublicSettings();
    setCurrency(settings.currency);
    setAppStatus(settings.appStatus);
    setSettingsLoading(false);
  };

  const fetchData = async () => {
    try {
      if (isOrganizationUnavailable) {
        setCategory(null);
        setDeals([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);

      if (!categoryId) {
        setCategory(null);
        setDeals([]);
        return;
      }

      const apiService = ApiService.getInstance();
      const response = await apiService.getDealCategory(categoryId, branch?.id);

      if (response?.success) {
        setCategory(response.data);
        setDeals(response.data?.deals || []);
      } else {
        setError("Failed to load deal category");
        setCategory(null);
        setDeals([]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load deal category");
      setCategory(null);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [branch?.id, categoryId, customerOrganizationSlug]);

  // Clear state when branch or organization changes to avoid stale categoryId 404s
  useEffect(() => {
    setCategory(null);
    setDeals([]);
    setError(null);
  }, [branch?.id, customerOrganizationSlug]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchSettings(), fetchData()]);
    } finally {
      setRefreshing(false);
    }
  };

  const effectiveAppStatus = isOrganizationUnavailable ? organizationAppStatus : appStatus;
  const isAppUnavailable = (!settingsLoading || isOrganizationUnavailable) && effectiveAppStatus !== "LIVE";

  if (settingsLoading && !isOrganizationUnavailable) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        {statusBarHeight > 0 && (
          <View style={[styles.statusBarBackground, { height: statusBarHeight }]} />
        )}
        <View
          style={[
            styles.center,
            {
              paddingTop: statusBarHeight + 70,
            },
          ]}
        >
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.mutedText}>{t("appStatus.loading")}</Text>
        </View>
      </View>
    );
  }

  if (isAppUnavailable) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        {statusBarHeight > 0 && (
          <View style={[styles.statusBarBackground, { height: statusBarHeight }]} />
        )}
        <View style={{ flex: 1, paddingTop: statusBarHeight + 70 }}>
          <AppStatusNotice status={effectiveAppStatus as any} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {statusBarHeight > 0 && (
        <View style={[styles.statusBarBackground, { height: statusBarHeight }]} />
      )}

      <View style={[styles.header, { paddingTop: statusBarHeight + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {category?.name || t("home.specialOfferCategories")}
        </Text>
        <View style={styles.headerRight}>
          <LanguageSwitcher />
          <TouchableOpacity style={styles.cartButton} onPress={() => router.push("/cart")}>
            <MaterialIcons name="shopping-cart" size={16} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.headerSeparator} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 22, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
          />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.mutedText}>{t("home.loading")}</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
              <Text style={styles.retryButtonText}>{t("orders.tryAgain")}</Text>
            </TouchableOpacity>
          </View>
        ) : orderedDeals.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.mutedText}>{t("admin.dealManagement.noDealsFound")}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {orderedDeals.map((deal: any) => {
              const total = getDealTotal(deal);
              return (
                <View key={deal.id} style={styles.dealCard}>
                  <Image source={{ uri: getImageUrl(deal.image) }} style={styles.dealImage} />
                  <View style={styles.dealInfo}>
                    <Text style={styles.dealName} numberOfLines={1}>
                      {deal.name}
                    </Text>
                    {!!deal.description && (
                      <Text style={styles.dealDescription} numberOfLines={2}>
                        {deal.description}
                      </Text>
                    )}
                    <View style={styles.dealFooter}>
                      <Text style={styles.dealPrice}>{formatPrice(total, currency)}</Text>
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => {
                          router.push(`/deal/${deal.id}`);
                        }}
                      >
                        <Text style={styles.addButtonText}>{t("home.feedMe")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#151718",
    zIndex: 1001,
    elevation: 1001,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#151718",
    zIndex: 1000,
    elevation: 1000,
  },
  headerSeparator: {
    height: 1,
    backgroundColor: "#262626",
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
    gap: 10,
  },
  cartButton: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
  scroll: {
    flex: 1,
    backgroundColor: "#151718",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  mutedText: {
    color: "#9CA3AF",
    marginTop: 12,
  },
  errorText: {
    color: "#ef4444",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  list: {
    paddingHorizontal: 16,
    gap: 12,
  },
  dealCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    marginHorizontal: 0,
    marginBottom: 2,
    overflow: "hidden",
    flexDirection: "row",
    minHeight: 140,
  },
  dealImage: {
    width: 140,
    height: 140,
    backgroundColor: "#333",
  },
  dealInfo: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  dealName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
  },
  dealDescription: {
    fontSize: 12,
    color: "#aaa",
    marginBottom: 8,
  },
  dealFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dealPrice: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
  },
  addButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
});
