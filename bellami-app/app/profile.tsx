import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ApiService from "@/src/services/apiService";
import { Toast } from "@/components/Toast";
import { useTranslation } from "react-i18next";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useScroll } from "@/src/contexts/ScrollContext";
import { fetchPublicSettings } from "@/src/utils/currency";
import AppStatusNotice from "@/components/AppStatusNotice";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import branchService, { type Branch } from "@/src/services/branchService";
import { useBranch } from "@/src/contexts/BranchContext";

export default function ProfileScreen() {
  const router = useRouter();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const apiService = ApiService.getInstance();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    description: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phone?: string;
  }>({});

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });
  const [appStatus, setAppStatus] = useState<string>("LIVE");
  const [settingsLoading, setSettingsLoading] = useState(true);

  const { setBranch } = useBranch();
  const [likedBranches, setLikedBranches] = useState<Branch[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [appLevelNotificationsEnabled, setAppLevelNotificationsEnabled] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const loadLikedBranches = async () => {
    try {
      setLikesLoading(true);
      const token = await getToken();
      if (!token) return;
      const result = await branchService.getLikedBranches(token);
      if (result && result.success && Array.isArray(result.data)) {
        setLikedBranches(result.data);
      }
    } catch (error) {
      console.error("Error loading liked branches:", error);
    } finally {
      setLikesLoading(false);
    }
  };

  const loadAppLevelNotificationStatus = async () => {
    try {
      setNotificationsLoading(true);
      const token = await getToken();
      if (!token) return;
      
      const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";
      const response = await fetch(`${API_BASE_URL}/api/push-notifications/app-level-status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const json = await response.json();
        if (json.success && json.data) {
          setAppLevelNotificationsEnabled(json.data.enabled);
        }
      }
    } catch (error) {
      console.error("Error loading app-level notification status:", error);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const updateAppLevelNotificationStatus = async (enabled: boolean) => {
    try {
      const token = await getToken();
      if (!token) return;
      
      const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";
      const response = await fetch(`${API_BASE_URL}/api/push-notifications/app-level-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
      
      if (response.ok) {
        setAppLevelNotificationsEnabled(enabled);
        showToast(
          enabled 
            ? t("profile.notificationsEnabled", { defaultValue: "Notifications enabled" })
            : t("profile.notificationsDisabled", { defaultValue: "Notifications disabled" }),
          "success"
        );
      } else {
        showToast(t("profile.notificationUpdateError", { defaultValue: "Failed to update notification settings" }), "error");
      }
    } catch (error) {
      console.error("Error updating app-level notification status:", error);
      showToast(t("profile.notificationUpdateError", { defaultValue: "Failed to update notification settings" }), "error");
    }
  };

  useEffect(() => {
    fetchPublicSettings().then((settings) => {
      setAppStatus(settings.appStatus);
      setSettingsLoading(false);
    });
    if (isSignedIn && user) {
      loadUserProfile();
      loadLikedBranches();
      loadAppLevelNotificationStatus();
    }
  }, [isSignedIn, user]);

  const loadUserProfile = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const result = await apiService.getUserProfile(token);

      if (result.success && result.data) {
        setProfileData({
          firstName: result.data.firstName || user?.firstName || "",
          lastName: result.data.lastName || user?.lastName || "",
          phone:
            result.data.phone || user?.phoneNumbers?.[0]?.phoneNumber || "",
          description: result.data.description || "",
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      // Fallback to Clerk user data
      setProfileData({
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        phone: user?.phoneNumbers?.[0]?.phoneNumber || "",
        description: "",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const token = await getToken();
      if (!token) return;

      // Update profile using API
      await apiService.updateProfile(token, profileData);

      // Navigate back
      router.back();
    } catch (error) {
      console.error("Error saving profile:", error);
      alert(t("profile.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setProfileData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ visible: true, message, type });
  };

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const direction = currentScrollY > lastScrollY.current ? "down" : "up";
    setScrollDirection(direction);
    setScrollPosition(currentScrollY);
    lastScrollY.current = currentScrollY;
  };

  if (settingsLoading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("common.profile")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight, flex: 1, justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={{ color: "#9CA3AF", marginTop: 16 }}>{t("appStatus.loading")}</Text>
        </View>
      </View>
    );
  }

  const isAppUnavailable = appStatus !== "LIVE";

  if (isAppUnavailable) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("common.profile")}
          onBackPress={() => router.back()}
        />
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <AppStatusNotice status={appStatus as any} />
        </View>
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("common.profile")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.emptyContainer, { paddingTop: headerHeight }]}>
          <Text style={styles.emptyTitle}>{t("common.pleaseLogin")}</Text>
          <Text style={styles.emptySubtitle}>{t("profile.signInToView")}</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push("/(auth)/sign-in")}
          >
            <Text style={styles.loginButtonText}>{t("common.login")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("common.profile")}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("profile.loading")}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
    >
      <AnimatedHeader
        title={t("common.profile")}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + 30, paddingBottom: 100 },
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.personalInfo")}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("profile.firstName")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("profile.firstNamePlaceholder")}
              placeholderTextColor="#9BA1A6"
              value={profileData.firstName}
              onChangeText={(text) => handleInputChange("firstName", text)}
            />
            {errors.firstName && (
              <Text style={styles.errorText}>{errors.firstName}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("profile.lastName")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("profile.lastNamePlaceholder")}
              placeholderTextColor="#9BA1A6"
              value={profileData.lastName}
              onChangeText={(text) => handleInputChange("lastName", text)}
            />
            {errors.lastName && (
              <Text style={styles.errorText}>{errors.lastName}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("profile.phoneNumber")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("profile.phonePlaceholder")}
              placeholderTextColor="#9BA1A6"
              value={profileData.phone}
              onChangeText={(text) => handleInputChange("phone", text)}
              keyboardType="phone-pad"
            />
            {errors.phone && (
              <Text style={styles.errorText}>{errors.phone}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("profile.email")}</Text>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={user?.emailAddresses?.[0]?.emailAddress || ""}
              editable={false}
            />
            <Text style={styles.helperText}>{t("profile.emailManaged")}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("profile.bio")}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t("profile.bioPlaceholder")}
              placeholderTextColor="#9BA1A6"
              value={profileData.description}
              onChangeText={(text) => handleInputChange("description", text)}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Favorited Branches Section */}
        {likedBranches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("profile.favoritedBranches", { defaultValue: "Favorisierte Filialen" })}</Text>
            {likedBranches.map((br) => (
              <TouchableOpacity
                key={br.id}
                style={styles.favBranchItem}
                activeOpacity={0.7}
                onPress={async () => {
                  // Store the complete branch data in AsyncStorage for the Menu page to use
                  // This ensures the branch is available even if it's filtered out by location
                  try {
                    await AsyncStorage.setItem("selectedBranchId", br.id);
                    await AsyncStorage.setItem("selectedBranchData", JSON.stringify(br));
                    await AsyncStorage.setItem("skipAutoBranchSelect", "true");
                  } catch (e) {
                    console.error("[Profile] Failed to store selected branch data:", e);
                  }

                  setBranch({
                    id: br.id,
                    name: br.name ?? null,
                    distanceKm: null,
                  });
                  showToast(t("profile.branchSwitched", { defaultValue: "Filiale gewechselt zu {{name}}", name: br.name }), "success");
                  setTimeout(() => {
                    router.push("/(tabs)/menu?fromFavorites=true");
                  }, 500);
                }}
              >
                <View style={styles.favBranchLeft}>
                  <MaterialCommunityIcons name="store" size={18} color="#ec4899" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.favBranchName}>{br.name}</Text>
                    {br.address ? (
                      <Text style={styles.favBranchAddress} numberOfLines={1}>
                        {br.address}, {br.city}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <MaterialCommunityIcons name="heart" size={18} color="#f43f5e" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* App-Level Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.notifications", { defaultValue: "Notifications" })}</Text>
          <View style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>
                {t("profile.appLevelNotifications", { defaultValue: "Application-level notifications" })}
              </Text>
              <Text style={styles.menuItemDescription}>
                {t("profile.appLevelNotificationsDesc", { defaultValue: "Receive notifications from Next Foody" })}
              </Text>
            </View>
            {notificationsLoading ? (
              <ActivityIndicator size="small" color="#ec4899" />
            ) : (
              <Switch
                value={appLevelNotificationsEnabled}
                onValueChange={updateAppLevelNotificationStatus}
                trackColor={{ false: "#333", true: "#ec4899" }}
                thumbColor="#fff"
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.legal")}</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/terms-and-policies?type=TERMS_OF_SERVICE" as any)}
          >
            <Text style={styles.menuItemText}>{t("profile.termsOfService")}</Text>
            <Text style={styles.menuItemIcon}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/terms-and-policies?type=PRIVACY_POLICY" as any)}
          >
            <Text style={styles.menuItemText}>{t("profile.privacyPolicy")}</Text>
            <Text style={styles.menuItemIcon}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/terms-and-policies?type=COOKIE_POLICY" as any)}
          >
            <Text style={styles.menuItemText}>{t("profile.cookiePolicy")}</Text>
            <Text style={styles.menuItemIcon}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Save Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              {t("profile.saveChanges")}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    paddingBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#fff",
    minHeight: 50,
  },
  disabledInput: {
    backgroundColor: "#1a1a1a",
    opacity: 0.6,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  helperText: {
    fontSize: 12,
    color: "#9BA1A6",
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#9BA1A6",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#9BA1A6",
    marginBottom: 32,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  loginButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#151718",
    borderTopWidth: 1,
    borderTopColor: "#333",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
  },
  saveButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  menuItemContent: {
    flex: 1,
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "500",
  },
  menuItemDescription: {
    fontSize: 13,
    color: "#9BA1A6",
    marginTop: 4,
  },
  menuItemIcon: {
    fontSize: 20,
    color: "#9BA1A6",
  },
  favBranchItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  favBranchLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  favBranchName: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 2,
  },
  favBranchAddress: {
    fontSize: 12,
    color: "#9BA1A6",
  },
});
