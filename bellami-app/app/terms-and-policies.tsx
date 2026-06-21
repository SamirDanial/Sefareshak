import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useScroll } from "@/src/contexts/ScrollContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { useAuth } from "@clerk/clerk-expo";
import { useTranslation } from "react-i18next";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

interface TermsAndPolicy {
  id: string;
  type: string;
  title: string;
  content: string;
  language: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
  isRequired: boolean;
}

export default function TermsAndPoliciesViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; language?: string }>();
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [policy, setPolicy] = useState<TermsAndPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  useEffect(() => {
    fetchPolicy();
  }, [params.type, params.language]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      setError(null);

      const type = params.type || "TERMS_OF_SERVICE";
      const language = params.language || "en";

      const response = await fetch(
        `${API_BASE_URL}/api/terms-and-policies/active?type=${type}&language=${language}`
      );

      // Handle non-200 status codes (actual errors)
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = "Failed to fetch policy";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || `HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      // Parse response (should be 200 even if no policy found)
      const data = await response.json();
      if (data.success && data.data) {
        setPolicy(data.data);
      } else {
        // Handle case where no policy exists (success:false but 200 status)
        // This is not an error, just no data available
        setError(data.error || t("termsAndPolicies.policyNotAvailableMessage"));
      }
    } catch (e: any) {
      console.error("Error fetching policy:", e);
      setError(e.message || "Failed to load policy");
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const direction = currentScrollY > lastScrollY.current ? "down" : "up";
    setScrollDirection(direction);
    setScrollPosition(currentScrollY);
    lastScrollY.current = currentScrollY;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("termsAndPolicies.title")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("termsAndPolicies.loadingPolicy")}</Text>
        </View>
      </View>
    );
  }

  if (error || (!loading && !policy)) {
    const isNotFound = error?.includes("not found") || error?.includes("404") || error?.includes("Active policy not found");
    
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("termsAndPolicies.title")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.errorContainer, { paddingTop: headerHeight }]}>
          <MaterialCommunityIcons 
            name={isNotFound ? "file-document" : "alert"} 
            size={48} 
            color={isNotFound ? "#9CA3AF" : "#ef4444"} 
          />
          <Text style={styles.errorTitle}>
            {isNotFound ? t("termsAndPolicies.policyNotAvailable") : t("termsAndPolicies.errorLoadingPolicy")}
          </Text>
          <Text style={styles.errorText}>
            {isNotFound 
              ? t("termsAndPolicies.policyNotAvailableMessage")
              : error || t("termsAndPolicies.errorLoadingMessage")
            }
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchPolicy}
          >
            <Text style={styles.retryButtonText}>{t("termsAndPolicies.retry")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={t(`termsAndPolicies.policyTypeLabels.${policy.type}`) || policy.title}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + 10, paddingBottom: 100 },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.policyContainer}>
          <View style={styles.policyHeader}>
            <Text style={styles.policyTitle}>{policy.title}</Text>
            <View style={styles.policyMeta}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {t(`termsAndPolicies.policyTypeLabels.${policy.type}`) || policy.type}
                </Text>
              </View>
              <Text style={styles.version}>{t("termsAndPolicies.version")} {policy.version}</Text>
            </View>
            <Text style={styles.effectiveDate}>
              {t("termsAndPolicies.effective")}: {new Date(policy.effectiveDate).toLocaleDateString()}
            </Text>
          </View>

          <View style={styles.contentContainer}>
            <Text style={styles.content}>{policy.content}</Text>
          </View>
        </View>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
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
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#9CA3AF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  policyContainer: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#262626",
  },
  policyHeader: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  policyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  policyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  badge: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  version: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  effectiveDate: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  contentContainer: {
    marginTop: 8,
  },
  content: {
    fontSize: 15,
    lineHeight: 24,
    color: "#D1D5DB",
  },
});

