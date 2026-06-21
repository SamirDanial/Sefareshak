import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useBranch } from "@/src/contexts/BranchContext";
import { useCartStore } from "@/src/store/cartStore";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import branchService from "@/src/services/branchService";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/200x200?text=Food";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

const placeholderImageForBranch = (name: string | null | undefined) => {
  const label = (name || "Branch").trim() || "Branch";
  const letter = label[0]?.toUpperCase() || "B";
  return `https://placehold.co/400x225/ec4899/ffffff?text=${letter}`;
};

export default function FavoritesScreen() {
  const { isSignedIn, getToken } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const { setBranch, branch } = useBranch();
  const { clearCart } = useCartStore();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'ios' ? insets.top : 0;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [likedBranchIds, setLikedBranchIds] = useState<string[]>([]);
  const [favoriteBranches, setFavoriteBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch liked branch IDs
  const fetchLikedBranches = async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await branchService.getLikedBranches(token);
      if (res && res.success && Array.isArray(res.data)) {
        const ids = res.data.map((b: any) => b.id);
        setLikedBranchIds(ids);
      } else {
        console.error("[Favorites] Invalid API response format:", res);
      }
    } catch (err) {
      console.error("[Favorites] Error fetching liked branches:", err);
      setError(t("favorites.error", { defaultValue: "Failed to load favorites" }));
    }
  };

  // Fetch full branch details for liked branches
  const fetchFavoriteBranchDetails = async () => {
    if (likedBranchIds.length === 0) {
      setFavoriteBranches([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch all branches WITHOUT token to get all branches from all organizations
      const allBranches = await branchService.getBranches(undefined);
      if (allBranches && Array.isArray(allBranches)) {
        const favorites = allBranches.filter((b: any) => likedBranchIds.includes(b.id));
        setFavoriteBranches(favorites);
      } else {
        console.error("[Favorites] Invalid branches response:", allBranches);
      }
    } catch (err) {
      console.error("[Favorites] Error fetching branch details:", err);
      setError(t("favorites.error", { defaultValue: "Failed to load favorites" }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetchLikedBranches();
  }, [isSignedIn]);

  useEffect(() => {
    if (likedBranchIds.length > 0) {
      fetchFavoriteBranchDetails();
    } else {
      setLoading(false);
    }
  }, [likedBranchIds]);

  const handleBranchClick = async (branchData: any) => {
    if (!branchData?.id) return;


    // Clear cart when switching branches
    clearCart();

    // Store the complete branch data in AsyncStorage for the Menu page to use
    try {
      await AsyncStorage.setItem("selectedBranchId", branchData.id);
      await AsyncStorage.setItem("selectedBranchData", JSON.stringify(branchData));
      await AsyncStorage.setItem("skipAutoBranchSelect", "true");
    } catch (e) {
      console.error("[Favorites] Failed to store selected branch data:", e);
    }

    await setBranch({
      id: branchData.id,
      name: branchData.name ?? null,
      distanceKm: null,
    });
    router.push({
      pathname: "/(tabs)/menu",
      params: {
        fromFavorites: "true",
        favoriteBranchId: branchData.id,
        t: Date.now().toString(),
      },
    });
  };

  const handleBrowseBranches = () => {
    router.push("/scope");
  };

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("favorites.title", { defaultValue: "My Favorites" })}
          onBackPress={() => router.back()}
        />
        <View style={[styles.emptyContainer, { paddingTop: headerHeight }]}>
          <MaterialCommunityIcons name="heart" size={48} color="#9BA1A6" />
          <Text style={styles.emptyTitle}>{t("common.pleaseLogin")}</Text>
          <Text style={styles.emptySubtitle}>{t("profile.signInToView")}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("favorites.title", { defaultValue: "My Favorites" })}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("favorites.loading.title", { defaultValue: "Loading favorites..." })}
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("favorites.title", { defaultValue: "My Favorites" })}
          onBackPress={() => router.back()}
        />
        <View style={[styles.emptyContainer, { paddingTop: headerHeight }]}>
          <MaterialCommunityIcons name="heart" size={48} color="#9BA1A6" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={fetchLikedBranches}
          >
            <Text style={styles.refreshButtonText}>
              {t("common.refresh", { defaultValue: "Refresh" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (favoriteBranches.length === 0) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("favorites.title", { defaultValue: "My Favorites" })}
          onBackPress={() => router.back()}
        />
        <View style={[styles.emptyContainer, { paddingTop: headerHeight }]}>
          <View style={styles.emptyIconContainer}>
            <MaterialCommunityIcons name="heart" size={48} color="#ec4899" />
          </View>
          <Text style={styles.emptyTitle}>
            {t("favorites.empty.title", { defaultValue: "No favorites yet" })}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t("favorites.empty.description", { defaultValue: "Start liking branches to see them here!" })}
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={handleBrowseBranches}
          >
            <Text style={styles.browseButtonText}>
              {t("favorites.empty.cta", { defaultValue: "Browse Branches" })}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={t("favorites.title", { defaultValue: "My Favorites" })}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 20 }]}
      >
        <View style={styles.header}>
          <View style={styles.headerIconContainer}>
            <MaterialCommunityIcons name="heart" size={24} color="#ec4899" />
          </View>
          <Text style={styles.headerTitle}>
            {t("favorites.title", { defaultValue: "My Favorite Branches" })}
          </Text>
        </View>

        <View style={styles.branchesGrid}>
          {favoriteBranches.map((branchData) => {
            const isSelected = branch?.id && branchData.id === branch.id;
            const organizationName = branchData?.organization?.name || branchData?.organization?.settings?.businessName;
            const imageUrl = branchData?.branchImage ? getImageUrl(branchData.branchImage) : placeholderImageForBranch(branchData.name);

            return (
              <TouchableOpacity
                key={branchData.id}
                style={[
                  styles.branchCard,
                  isSelected ? styles.branchCardSelected : styles.branchCardNormal,
                ]}
                onPress={() => handleBranchClick(branchData)}
                activeOpacity={0.7}
              >
                <View style={styles.branchImageContainer}>
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.branchImage}
                    resizeMode="cover"
                  />
                  <View style={styles.heartBadge}>
                    <MaterialCommunityIcons name="heart" size={16} color="#ec4899" />
                  </View>
                </View>
                <View style={styles.branchCardContent}>
                  <View style={styles.branchInfo}>
                    <View style={styles.branchNameContainer}>
                      <Text style={styles.branchName} numberOfLines={1}>
                        {branchData.name}
                      </Text>
                      <MaterialCommunityIcons name="store" size={16} color="#ec4899" />
                    </View>
                    {organizationName && (
                      <Text style={styles.organizationName} numberOfLines={1}>
                        {organizationName}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <View style={styles.selectedIndicator}>
                      <MaterialCommunityIcons name="arrow-right" size={14} color="#ec4899" />
                      <Text style={styles.selectedText}>
                        {t("common.selected", { defaultValue: "Selected" })}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  headerIconContainer: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 20,
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  branchesGrid: {
    gap: 16,
  },
  branchCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
  },
  branchCardNormal: {
    borderColor: "#2a2a2a",
  },
  branchCardSelected: {
    borderColor: "rgba(236, 72, 153, 0.7)",
  },
  branchImageContainer: {
    aspectRatio: 16 / 9,
    position: "relative",
  },
  branchImage: {
    width: "100%",
    height: "100%",
  },
  heartBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 12,
    padding: 6,
  },
  branchCardContent: {
    padding: 16,
    gap: 8,
  },
  branchInfo: {
    gap: 4,
  },
  branchNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  branchName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  organizationName: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  selectedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectedText: {
    fontSize: 12,
    color: "#ec4899",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyIconContainer: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 32,
    padding: 24,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9BA1A6",
    textAlign: "center",
  },
  browseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  browseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 16,
    color: "#9BA1A6",
    textAlign: "center",
  },
  refreshButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  refreshButtonText: {
    color: "#ec4899",
    fontSize: 16,
    fontWeight: "600",
  },
});
