import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Image,
  Pressable,
  Modal,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth, useUser } from "@clerk/clerk-expo";

import { useBranch } from "@/src/contexts/BranchContext";
import googlePlacesService from "@/src/services/googlePlacesService";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { UserMenu } from "@/components/UserMenu";

type ScopeMode = "DELIVERY" | "PICKUP" | "RESERVATION";

export default function ScopeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reset?: string }>();
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const [showMenu, setShowMenu] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  useFocusEffect(
    useCallback(() => {
      if (params?.reset === "1") {
        setStep(1);
      }
    }, [params?.reset])
  );

  const navbarHeight = 70;
  const headerHeight = insets.top + navbarHeight;

  const autoLocationAttemptedRef = useRef(false);

  const closeScope = useCallback(() => {
    router.replace("/(tabs)" as any);
  }, [router]);

  const handleLogin = useCallback(() => {
    router.push("/(auth)/sign-in" as any);
  }, [router]);

  const {
    customerServiceType,
    customerServiceMode,
    customerRadiusKm,
    customerLocation,
    setCustomerServiceType,
    setCustomerServiceMode,
    setCustomerRadiusKm,
    setCustomerLocation,
    customerBranchSearchQuery,
    setCustomerBranchSearchQuery,
    visibleBranches,
    loadingBranches,
  } = useBranch();

  const [typedAddress, setTypedAddress] = useState<string>(customerLocation?.label || "");
  const [typedBranchOrgQuery, setTypedBranchOrgQuery] = useState<string>(customerBranchSearchQuery || "");
  const [showBranchOrgSuggestions, setShowBranchOrgSuggestions] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<{ description: string; place_id: string }[]>(
    []
  );
  const [typedRadiusKm, setTypedRadiusKm] = useState<string>(String(customerRadiusKm ?? 20));
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const stepTitle = useMemo(() => {
    if (step === 1) {
      return t("home.scope.step1HeroTitle", {
        defaultValue: "Which kind of service are you looking for?",
      });
    }
    if (step === 2) {
      return t("home.scope.modeTitle", { defaultValue: "How would you like to order?" });
    }
    return customerServiceMode === "DELIVERY"
      ? t("home.scope.pickLocation", { defaultValue: "Please set your delivery location" })
      : t("home.scope.pickLocationGeneric", { defaultValue: "Where are you?" });
  }, [customerServiceMode, step, t]);

  const stepDescription = useMemo(() => {
    if (step === 1) {
      return t("home.scope.step1HeroSubtitle", { defaultValue: "Choose what you want." });
    }
    if (step === 2) {
      return t("home.scope.step2Description", {
        defaultValue: "Choose delivery, pickup, or reservation.",
      });
    }
    return t("home.scope.step3Description", {
      defaultValue: "Set your location so we can show the right branches.",
    });
  }, [step, t]);

  const serviceOptions = useMemo(
    () => [
      {
        type: "RESTAURANT" as const,
        title: t("home.scope.services.restaurant", { defaultValue: "Restaurant" }),
        hint: t("home.scope.services.restaurantHint", { defaultValue: "Meals and drinks" }),
        subText: t("home.scope.services.restaurantSubText", { defaultValue: "Delivery Service" }),
      },
      {
        type: "MEAT_SHOP" as const,
        title: t("home.scope.services.meatShop", { defaultValue: "Meat Shop" }),
        hint: t("home.scope.services.meatShopHint", { defaultValue: "Fresh cuts and packages" }),
      },
      {
        type: "BAKERY" as const,
        title: t("home.scope.services.bakery", { defaultValue: "Bakery" }),
        hint: t("home.scope.services.bakeryHint", { defaultValue: "Bread, pastries, desserts" }),
      },
      {
        type: "FOOD_TRUCK" as const,
        title: t("home.scope.services.foodTruck", { defaultValue: "Food Truck" }),
        hint: t("home.scope.services.foodTruckHint", { defaultValue: "Street food on the go" }),
      },
    ],
    [t]
  );

  const modeOptions = useMemo(
    () =>
      [
        {
          mode: "DELIVERY" as const,
          label: t("home.scope.modes.delivery", { defaultValue: "Delivery" }),
        },
        {
          mode: "PICKUP" as const,
          label: t("home.scope.modes.pickup", { defaultValue: "Pickup" }),
        },
        {
          mode: "RESERVATION" as const,
          label: t("home.scope.modes.reservation", { defaultValue: "Reservation" }),
        },
      ] satisfies { mode: ScopeMode; label: string }[],
    [t]
  );

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const branchOrgSuggestions = useMemo(() => {
    const raw = typedBranchOrgQuery.trim().toLowerCase();
    if (!raw) return [] as { key: string; label: string; applyQuery: string }[];

    const list = (visibleBranches || []) as any[];

    const orgMap = new Map<string, { key: string; label: string; applyQuery: string }>();
    for (const b of list) {
      const orgName = String(b?.organization?.name || "").trim();
      if (!orgName) continue;
      const k = `org:${orgName.toLowerCase()}`;
      if (orgMap.has(k)) continue;
      orgMap.set(k, {
        key: k,
        label: orgName,
        applyQuery: orgName,
      });
    }

    const orgSuggestions = Array.from(orgMap.values()).filter((o) => o.label.toLowerCase().includes(raw));

    const branchSuggestions = list
      .filter((b) => {
        const branchName = String(b?.name || "").toLowerCase();
        const branchCode = String(b?.code || "").toLowerCase();
        const orgName = String(b?.organization?.name || "").toLowerCase();
        const businessName = String(b?.organization?.settings?.businessName || "").toLowerCase();
        const orgSlug = String(b?.organization?.slug || "").toLowerCase();
        const haystack = `${branchName} ${branchCode} ${orgName} ${businessName} ${orgSlug}`.trim();
        return haystack.includes(raw);
      })
      .map((b) => {
        const name = String(b?.name || "").trim();
        const code = String(b?.code || "").trim();
        const orgName = String(b?.organization?.name || "").trim();
        const label = `${name}${code ? ` (${code})` : ""}${orgName ? ` • ${orgName}` : ""}`;
        return {
          key: `branch:${String(b?.id || label)}`,
          label,
          applyQuery: name || code || label,
        };
      });

    return [...orgSuggestions, ...branchSuggestions].slice(0, 8);
  }, [typedBranchOrgQuery, visibleBranches]);

  const requestAndGetDeviceCoords = useCallback(async () => {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) return null;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;

      // Use balanced accuracy for faster results on real devices
      // High accuracy can hang indefinitely on iOS when GPS signal is weak
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch (err) {
      console.error("Failed to get device location:", err);
      return null;
    }
  }, []);

  const handleUseMyLocation = useCallback(async () => {
    setIsGettingLocation(true);
    try {
      const coords = await requestAndGetDeviceCoords();
      if (!coords) return;

      const components = await googlePlacesService.reverseGeocode(coords.latitude, coords.longitude);
      const label = components?.formattedAddress || null;

      setCustomerLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        label,
      });
      setTypedAddress(label || "");
    } catch {
      return;
    } finally {
      setIsGettingLocation(false);
    }
  }, [requestAndGetDeviceCoords, setCustomerLocation]);

  useEffect(() => {
    if (autoLocationAttemptedRef.current) return;
    if (customerLocation) return;

    autoLocationAttemptedRef.current = true;
    handleUseMyLocation();
  }, [customerLocation, handleUseMyLocation]);

  const handleSearchAddress = useCallback(async () => {
    const trimmed = typedAddress.trim();
    if (!trimmed) return;

    setIsSearchingAddress(true);
    try {
      const coords = await googlePlacesService.geocodeAddress(trimmed);
      if (!coords) return;

      setCustomerLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        label: trimmed,
      });
    } finally {
      setIsSearchingAddress(false);
    }
  }, [setCustomerLocation, typedAddress]);

  useEffect(() => {
    if (step !== 3) return;
    const q = typedAddress.trim();
    if (!q) {
      setAddressSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        const res = await googlePlacesService.autocompleteAddress(q);
        setAddressSuggestions(res);
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [step, typedAddress]);

  const handleSelectAddressSuggestion = useCallback(
    async (s: { description: string; place_id: string }) => {
      setTypedAddress(s.description);
      setShowAddressSuggestions(false);
      setAddressSuggestions([]);

      setIsSearchingAddress(true);
      try {
        const coords = await googlePlacesService.getPlaceLatLng(s.place_id);
        if (!coords) return;
        setCustomerLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
          label: s.description,
        });
      } finally {
        setIsSearchingAddress(false);
      }
    },
    [setCustomerLocation]
  );

  const handleNextFromStep2 = useCallback(() => {
    if (!customerServiceMode) return;
    if (customerServiceMode !== "DELIVERY") {
      const n = Number(typedRadiusKm);
      const nextRadius = Number.isFinite(n) && n > 0 ? n : 20;
      setCustomerRadiusKm(nextRadius);
      setTypedRadiusKm(String(nextRadius));
    }
    setStep(3);
  }, [customerServiceMode, setCustomerRadiusKm, typedRadiusKm]);

  const handleContinue = useCallback(() => {
    if (isContinuing) return;
    if (!customerServiceType) return;
    if (customerServiceMode !== "DELIVERY" && !customerLocation) return;

    // Flush query immediately so it can't be lost by subsequent scope persistence updates (e.g., location).
    // Also ensures Home loads with the intended branch/org filtering.
    setCustomerBranchSearchQuery(typedBranchOrgQuery);

    if (customerServiceMode !== "DELIVERY") {
      const n = Number(typedRadiusKm);
      const nextRadius = Number.isFinite(n) && n > 0 ? n : 20;
      setCustomerRadiusKm(nextRadius);
      setTypedRadiusKm(String(nextRadius));
    }

    const noBranches = !loadingBranches && visibleBranches.length === 0;

    try {
      setIsContinuing(true);
      try {
        if (noBranches) {
          void AsyncStorage.setItem("bellami:scopeNoBranches", "1");
        } else {
          void AsyncStorage.removeItem("bellami:scopeNoBranches");
        }
      } catch {
        // ignore
      }

      closeScope();
    } finally {
      setIsContinuing(false);
    }
  }, [
    customerLocation,
    customerServiceMode,
    customerServiceType,
    isContinuing,
    closeScope,
    loadingBranches,
    setCustomerRadiusKm,
    setCustomerBranchSearchQuery,
    typedRadiusKm,
    typedBranchOrgQuery,
    visibleBranches.length,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled={keyboardVisible}
    >
      <ImageBackground
        source={require("../assets/images/NextFoody.png")}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.bgDim} />
        <View style={styles.bgTopFade} />

        <View style={[styles.navbar, { paddingTop: insets.top, height: headerHeight }]}>
          {step !== 1 ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep((s) => (s === 3 ? 2 : 1))}
            >
              <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text style={styles.navbarTitle}>{t("home.scope.title", { defaultValue: "Scope" })}</Text>
          <View style={styles.navbarRight}>
            <LanguageSwitcher />
            {isLoaded && userLoaded ? (
              isSignedIn ? (
                <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.avatarButton}>
                  {user?.imageUrl ? (
                    <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {user?.firstName?.charAt(0) ||
                          user?.primaryEmailAddress?.emailAddress?.charAt(0)?.toUpperCase() ||
                          "?"}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleLogin} style={styles.loginButton}>
                  <Text style={styles.loginButtonText}>{t("common.login", { defaultValue: "Login" })}</Text>
                </TouchableOpacity>
              )
            ) : null}
          </View>
        </View>

        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
            <View style={styles.menuWrapper}>
              <UserMenu onClose={() => setShowMenu(false)} />
            </View>
          </Pressable>
        </Modal>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: headerHeight + 16 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroWrap}>
            <View style={styles.heroIcon}>
              <MaterialIcons name="store" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{stepTitle}</Text>
              <Text style={styles.heroSubtitle}>{stepDescription}</Text>
            </View>
          </View>

          {step === 1 ? (
            <View style={styles.tilesGrid}>
              {serviceOptions.map((opt, idx) => {
                const selected = customerServiceType === opt.type;
                const gradient =
                  opt.type === "RESTAURANT"
                    ? styles.tileGradRestaurant
                    : opt.type === "BAKERY"
                      ? styles.tileGradBakery
                      : opt.type === "MEAT_SHOP"
                        ? styles.tileGradMeat
                        : styles.tileGradTruck;

                const iconName =
                  opt.type === "RESTAURANT"
                    ? "restaurant"
                    : opt.type === "BAKERY"
                      ? "bakery-dining"
                      : opt.type === "MEAT_SHOP"
                        ? "lunch-dining"
                        : "local-shipping";

                return (
                  <TouchableOpacity
                    key={opt.type}
                    style={[
                      styles.tile,
                      gradient,
                      selected && styles.tileSelected,
                    ]}
                    onPress={() => {
                      setCustomerServiceType(opt.type);
                      // Set default service mode based on service type
                      if (opt.type === "RESTAURANT") {
                        setCustomerServiceMode("DELIVERY");
                      } else {
                        setCustomerServiceMode("PICKUP");
                      }
                      setStep(2);
                    }}
                    activeOpacity={0.9}
                  >
                    <View style={styles.tileRow}>
                      <View
                        style={[
                          styles.tileIconWrap,
                          selected ? styles.tileIconWrapSelected : null,
                        ]}
                      >
                        <MaterialIcons name={iconName as any} size={18} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                          <Text style={styles.tileTitle} numberOfLines={1}>
                            {opt.title}
                          </Text>
                          {opt.subText && (
                            <Text style={styles.tileSubText} numberOfLines={1}>
                              {" / "}{opt.subText}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.tileHint} numberOfLines={2}>
                          {opt.hint}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {t("home.scope.modeTitle", { defaultValue: "How would you like to order?" })}
              </Text>
              <View style={styles.modeRow}>
                {modeOptions.map((m) => {
                  const selected = customerServiceMode === m.mode;
                  return (
                    <TouchableOpacity
                      key={m.mode}
                      style={[styles.modeChip, selected && styles.modeChipSelected]}
                      onPress={() => setCustomerServiceMode(m.mode)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.modeChipText, selected && styles.modeChipTextSelected]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {customerServiceMode !== "DELIVERY" ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.label}>
                    {t("home.scope.radiusLabel", { defaultValue: "Search radius (km)" })}
                  </Text>
                  <TextInput
                    value={typedRadiusKm}
                    onChangeText={setTypedRadiusKm}
                    keyboardType="numeric"
                    placeholder="20"
                    placeholderTextColor="#6B7280"
                    style={styles.input}
                  />
                  <Text style={styles.hint}>
                    {t("home.scope.radiusHint", {
                      defaultValue: "We will show branches within this distance from your location.",
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {t("home.scope.step3Title", { defaultValue: "Step 3: Choose location" })}
              </Text>

              <View style={styles.inputWrapper}>
                <MaterialIcons name="store" size={18} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  value={typedBranchOrgQuery}
                  onChangeText={(text) => {
                    setTypedBranchOrgQuery(text);
                    setShowBranchOrgSuggestions(true);
                  }}
                  onFocus={() => setShowBranchOrgSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowBranchOrgSuggestions(false), 200);
                  }}
                  placeholder={t("findBranch.searchByBranchOrOrg", {
                    defaultValue: "Search by branch or organization name...",
                  })}
                  placeholderTextColor="#6B7280"
                  style={[styles.input, { paddingLeft: 40 }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {showBranchOrgSuggestions && branchOrgSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled">
                      {branchOrgSuggestions.map((s) => (
                        <TouchableOpacity
                          key={s.key}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setTypedBranchOrgQuery(s.applyQuery);
                            setCustomerBranchSearchQuery(s.applyQuery);
                            setShowBranchOrgSuggestions(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.suggestionText}>{s.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.inputWrapper}>
                <MaterialIcons name="location-on" size={18} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  value={typedAddress}
                  onChangeText={(text) => {
                    setTypedAddress(text);
                    setShowAddressSuggestions(true);
                  }}
                  onFocus={() => setShowAddressSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowAddressSuggestions(false), 200);
                  }}
                  placeholder={t("findBranch.addressPlaceholder", {
                    defaultValue: "Enter an address or location...",
                  })}
                  placeholderTextColor="#6B7280"
                  style={[styles.input, { paddingLeft: 40 }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => void handleSearchAddress()}
                />

                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled">
                      {addressSuggestions.map((s) => (
                        <TouchableOpacity
                          key={s.place_id}
                          style={styles.suggestionItem}
                          onPress={() => void handleSelectAddressSuggestion(s)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.suggestionText}>{s.description}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonSecondary]}
                  onPress={() => void handleSearchAddress()}
                  disabled={isSearchingAddress || !typedAddress.trim()}
                >
                  {isSearchingAddress ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.actionButtonText}>
                      {t("findBranch.searchAddress", { defaultValue: "Search Address" })}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonPrimary]}
                  onPress={() => void handleUseMyLocation()}
                  disabled={isGettingLocation}
                >
                  {isGettingLocation ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.actionButtonText}>
                      {t("findBranch.useMyLocation", { defaultValue: "Use My Location" })}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={styles.hint}>
                  {loadingBranches
                    ? t("home.scope.loadingBranches", { defaultValue: "Loading branches..." })
                    : `${visibleBranches.length} ${t("home.scope.branchesAvailable", {
                        defaultValue: "branches available",
                      })}`}
                </Text>
              </View>
            </View>
          ) : null}

          {step !== 1 ? (
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={[styles.footerButton, styles.footerButtonGhost]}
                onPress={() => setStep((s) => (s === 3 ? 2 : 1))}
                activeOpacity={0.85}
              >
                <Text style={styles.footerButtonGhostText}>
                  {t("common.back", { defaultValue: "Back" })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.footerButton, styles.footerButtonGhost]}
                onPress={closeScope}
                activeOpacity={0.85}
              >
                <Text style={styles.footerButtonGhostText}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>

              {step === 2 ? (
                <TouchableOpacity
                  style={[styles.footerButton, styles.footerButtonPrimary]}
                  onPress={handleNextFromStep2}
                  activeOpacity={0.85}
                >
                  <Text style={styles.footerButtonPrimaryText}>
                    {t("common.next", { defaultValue: "Next" })}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.footerButton, styles.footerButtonPrimary]}
                  onPress={handleContinue}
                  activeOpacity={0.85}
                  disabled={isContinuing || loadingBranches}
                >
                  {isContinuing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.footerButtonPrimaryText}>
                      {t("common.continue", { defaultValue: "Continue" })}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={{ height: 18 }} />
          )}
        </ScrollView>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  bg: {
    flex: 1,
  },
  bgDim: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  bgTopFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: "rgba(0,0,0,0.45)",
    opacity: 0.6,
  },
  bgBottomFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: "rgba(0,0,0,0.55)",
    opacity: 0.7,
  },
  navbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 1,
    zIndex: 10,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 10,
    marginRight: 6,
  },
  navbarTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  navbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  avatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  loginButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 16,
  },
  menuWrapper: {
    alignItems: "flex-end",
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 42,
  },
  heroWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 14,
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  heroSubtitle: {
    marginTop: 3,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontStyle: "italic",
  },
  tilesGrid: {
    flexDirection: "column",
    marginTop: 220,
  },
  tile: {
    width: "100%",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.25)",
    overflow: "hidden",
  },
  tileSelected: {
    borderColor: "rgba(255,255,255,0.35)",
  },
  tileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.22)",
    justifyContent: "center",
    alignItems: "center",
  },
  tileIconWrapSelected: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  tileTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  tileHint: {
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
    fontSize: 15,
    lineHeight: 18,
  },
  tileSubText: {
    color: "#fff",
    marginTop: 2,
    fontSize: 15,
    fontWeight: "800",
  },
  tileGradRestaurant: {
    backgroundColor: "#d946ef",
  },
  tileGradMeat: {
    backgroundColor: "#b91c1c",
  },
  tileGradBakery: {
    backgroundColor: "#d97706",
  },
  tileGradTruck: {
    backgroundColor: "#334155",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 18,
  },
  card: {
    backgroundColor: "rgba(23,23,23,0.92)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 10,
  },
  grid: {
    gap: 10,
  },
  option: {
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "transparent",
  },
  optionSelected: {
    backgroundColor: "rgba(236,72,153,0.15)",
    borderColor: "rgba(236,72,153,0.6)",
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E5E7EB",
  },
  optionTitleSelected: {
    color: "#fff",
  },
  optionHint: {
    marginTop: 4,
    fontSize: 12,
    color: "#9CA3AF",
  },
  optionHintSelected: {
    color: "#E5E7EB",
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  modeChip: {
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  modeChipSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E5E7EB",
  },
  modeChipTextSelected: {
    color: "#fff",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D1D5DB",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#E5E7EB",
    backgroundColor: "#0F0F0F",
  },
  inputWrapper: {
    position: "relative",
    marginBottom: 12,
  },
  inputIcon: {
    position: "absolute",
    left: 12,
    top: 14,
    zIndex: 1,
  },
  suggestionsContainer: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 12,
    zIndex: 10,
    maxHeight: 192,
  },
  suggestionsScroll: {
    maxHeight: 192,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  suggestionText: {
    fontSize: 14,
    color: "#E5E7EB",
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: "#9CA3AF",
  },
  actionRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPrimary: {
    backgroundColor: "#ec4899",
  },
  actionButtonSecondary: {
    backgroundColor: "#2563eb",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  footerRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  footerButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  footerButtonPrimary: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  footerButtonSecondary: {
    backgroundColor: "transparent",
    borderColor: "#404040",
  },
  footerButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },

  footerActions: {
    marginTop: 6,
    marginBottom: 12,
    flexDirection: "column",
    gap: 10,
  },
  footerButtonGhost: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  footerButtonGhostText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  footerButtonPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
