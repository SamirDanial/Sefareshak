import React, { useState, useEffect, useMemo } from "react";
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
import { AuthNavbar } from "@/components/AuthNavbar";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialIcons } from "@expo/vector-icons";
import { useCartStore } from "@/src/store/cartStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBranch } from "@/src/contexts/BranchContext";
import ApiService from "@/src/services/apiService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/400x300?text=Food";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

// Function to truncate category name
const truncateCategoryName = (name: string): string => {
  if (name.length <= 12) {
    return name;
  }
  return name.substring(0, 9) + "...";
};

export default function CategoriesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getTotalItems } = useCartStore();
  const totalItems = getTotalItems();
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;
  const { branch } = useBranch();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, [branch?.id]);

  const visibleCategories = useMemo(() => {
    if (!branch?.id) return categories;
    return categories.filter((category: any) => {
      const excludedBranches = (category as any).excludedBranches || [];
      return !excludedBranches.includes(branch.id);
    });
  }, [categories, branch?.id]);

  const fetchCategories = async () => {
    try {
      const apiService = ApiService.getInstance();
      const data = await apiService.getCategories(false, branch?.id);
      setCategories((data as any)?.data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCategories();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Status Bar Background */}
      {statusBarHeight > 0 && (
        <View
          style={[styles.statusBarBackground, { height: statusBarHeight }]}
        />
      )}
      {/* Header */}
      <View style={[styles.header, { paddingTop: statusBarHeight + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {t("home.categories")}
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.cartButton}
            onPress={() => router.push("/cart")}
          >
            <MaterialIcons name="shopping-cart" size={16} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
          </View>
        ) : visibleCategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t("home.noCategories") || "No categories available"}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {visibleCategories.map((category: any, index: number) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryCard,
                  index % 2 === 0 && styles.categoryCardLeft,
                  index % 2 === 1 && styles.categoryCardRight,
                ]}
                onPress={() => {
                  router.push(`/(tabs)/menu?categoryId=${category.id}` as any);
                }}
                activeOpacity={0.9}
              >
                <View style={styles.imageContainer}>
                  <Image
                    source={{
                      uri: getImageUrl(category.image),
                    }}
                    style={styles.categoryImage}
                    resizeMode="cover"
                  />
                  <View style={styles.gradientOverlay} />
                </View>
                <View style={styles.categoryContent}>
                  <Text 
                    style={styles.categoryName} 
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {truncateCategoryName(category.name)}
                  </Text>
                  {category.description && (
                    <Text
                      style={styles.categoryDescription}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {category.description}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
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
    gap: 8,
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
  scrollContent: {
    flex: 1,
    backgroundColor: "#151718",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    justifyContent: "space-between",
  },
  categoryCard: {
    width: "48%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#262626",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  categoryCardLeft: {
    marginRight: "2%",
  },
  categoryCardRight: {
    marginLeft: "2%",
  },
  imageContainer: {
    width: "100%",
    height: 200,
    position: "relative",
    backgroundColor: "#262626",
    overflow: "hidden",
  },
  categoryImage: {
    width: "100%",
    height: "100%",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  categoryContent: {
    padding: 16,
    backgroundColor: "#1a1a1a",
  },
  categoryName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  categoryDescription: {
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 18,
  },
});
