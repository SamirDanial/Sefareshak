import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { useBranch } from "@/src/contexts/BranchContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ApiService from "@/src/services/apiService";
import { useTranslation } from "react-i18next";
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Text as SvgText } from "react-native-svg";
import branchClickService from "@/src/services/branchClickService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? "http://localhost:3001" : "https://nextfoody.com");

const getBranchImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  if (imagePath.startsWith("/uploads/images/")) return `${API_BASE_URL}${imagePath}`;
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

type BranchSwitcherVariant = "dropdown" | "carousel";

export function BranchSwitcher({
  variant = "dropdown",
  showCarouselHeader = true,
}: {
  variant?: BranchSwitcherVariant;
  showCarouselHeader?: boolean;
}) {
  const { branch, visibleBranches, loadingBranches, setBranch, clearReservationLock } = useBranch();
  const { userId } = useAuth();
  const { t } = useTranslation();
  const [isModifying, setIsModifying] = useState(false);
  const [failedCarouselImages, setFailedCarouselImages] = useState<Record<string, boolean>>({});
  const [preOrderLockedBranchId, setPreOrderLockedBranchId] = useState<string | null>(null);
  const [modifyingReservationId, setModifyingReservationId] = useState<string | null>(null);
  const [modifyingOrderId, setModifyingOrderId] = useState<string | null>(null);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [mainBranchId, setMainBranchId] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Fetch settings to get mainBranchId
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoadingSettings(true);
        const apiService = ApiService.getInstance();
        const response = await apiService.getPublicSettings();
        if (response.success && response.data?.mainBranchId) {
          setMainBranchId(response.data.mainBranchId);
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setLoadingSettings(false);
      }
    };

    fetchSettings();
  }, []);

  // Check if we're in modification mode or pre-order lock
  useEffect(() => {
    const checkBranchLock = async () => {
      try {
        const storedModifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
        const modifyingReservationBranchId = await AsyncStorage.getItem("modifyingReservationBranchId");
        const storedModifyingOrderId = await AsyncStorage.getItem("modifyingOrderId");
        const modifyingOrderBranchId = await AsyncStorage.getItem("modifyingOrderBranchId");
        const preOrderBranchLock = await AsyncStorage.getItem("preOrderBranchLock");
        setIsModifying(
          !!storedModifyingReservationId ||
            !!modifyingReservationBranchId ||
            !!storedModifyingOrderId ||
            !!modifyingOrderBranchId ||
            !!preOrderBranchLock
        );
        setPreOrderLockedBranchId(preOrderBranchLock || null);
        setModifyingReservationId(storedModifyingReservationId || null);
        setModifyingOrderId(storedModifyingOrderId || null);
      } catch (error) {
        console.error("Error checking branch lock:", error);
      }
    };

    checkBranchLock();
    // Check periodically in case of changes
    const interval = setInterval(checkBranchLock, 500);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleCancelLock = async () => {
    try {
      await clearReservationLock();
      setPreOrderLockedBranchId(null);
      setModifyingReservationId(null);
      setModifyingOrderId(null);
      setIsModifying(false);
    } catch (error) {
      console.error("Error clearing lock:", error);
    } finally {
      setShowCancelConfirm(false);
    }
  };

  // Set main branch as fallback ONLY if no branch is selected after BranchContext has finished
  // This allows the BranchContext to select nearest branch first
  useEffect(() => {
    const checkAndSetMainBranch = async () => {
      // Only set main branch if:
      // 1. No branch is currently selected
      // 2. Branches are fully loaded (not loading)
      // 3. Main branch exists
      // 4. Settings are loaded
      // 5. Wait a bit longer to ensure BranchContext has finished
      if (!branch && mainBranchId && visibleBranches.length > 0 && !loadingSettings && !loadingBranches) {
        try {
          // Wait a bit more to ensure BranchContext has finished its async operations
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Check again if branch is still not set
          if (!branch) {
            const persistedBranch = await AsyncStorage.getItem("bellami:selectedBranch");
            // Only set main branch if there's no persisted branch (meaning BranchContext didn't set nearest)
            if (!persistedBranch) {
              const mainBranch = visibleBranches.find((b) => b.id === mainBranchId);
              if (mainBranch) {
                setBranch({
                  id: mainBranch.id,
                  name: mainBranch.name || null,
                  distanceKm: null,
                });
              }
            }
          }
        } catch (error) {
          console.error("Error checking persisted branch:", error);
        }
      }
    };

    // Only run if branches are loaded and no branch is set
    if (!loadingBranches && !loadingSettings && visibleBranches.length > 0 && !branch) {
      const timeout = setTimeout(checkAndSetMainBranch, 2000);
      return () => clearTimeout(timeout);
    }
  }, [branch, mainBranchId, visibleBranches, setBranch, loadingSettings, loadingBranches]);

  const selectedBranchFull = branch?.id ? visibleBranches.find((b) => b.id === branch.id) : null;
  const isBranchUrgentlyClosed = (selectedBranchFull as any)?.isUrgentlyClosed === true;
  const urgentCloseMessage: string | null = (selectedBranchFull as any)?.urgentCloseMessage ?? null;

  // Separate main branch from other branches and sort other branches alphabetically
  const mainBranch = mainBranchId ? visibleBranches.find((b) => b.id === mainBranchId) : null;
  const otherBranches = visibleBranches
    .filter((b) => b.id !== mainBranchId)
    .sort((a, b) => {
      const nameA = (a.name || `Branch ${a.id.slice(0, 8)}`).toLowerCase();
      const nameB = (b.name || `Branch ${b.id.slice(0, 8)}`).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const handleBranchChange = (branchId: string) => {
    // Prevent branch changes when in modification mode
    if (isModifying) {
      return;
    }

    const selectedBranch = visibleBranches.find((b) => b.id === branchId);
    if (selectedBranch) {
      // Only record click if selecting a different branch
      if (branch?.id !== branchId) {
        // Record branch click (non-blocking)
        branchClickService.recordBranchClick(branchId, userId).catch(() => {
          // Silently ignore errors - click tracking shouldn't block user experience
        });
      }
      
      setBranch({
        id: selectedBranch.id,
        name: selectedBranch.name || null,
        distanceKm: null,
      });
      setShowBranchPicker(false);
    }
  };

  if (loadingBranches || loadingSettings) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#ec4899" />
        <Text style={styles.loadingText}>Loading branches...</Text>
      </View>
    );
  }

  if (visibleBranches.length === 0) {
    return null;
  }

  if (variant === "carousel") {
    const branchesForSelection = (() => {
      const list = [...visibleBranches];
      if (branch?.id) {
        const idx = list.findIndex((b) => b.id === branch.id);
        if (idx > 0) {
          const [selected] = list.splice(idx, 1);
          list.unshift(selected);
        }
      }
      return list;
    })();

    const placeholderImageFor = (name: string | null | undefined) => {
      const label = (name || "Branch").trim() || "Branch";
      const letter = label[0]?.toUpperCase() || "B";
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ec4899"/>
      <stop offset="50%" stop-color="#f43f5e"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" rx="36" fill="url(#g)"/>
  <circle cx="660" cy="110" r="120" fill="rgba(255,255,255,0.12)"/>
  <circle cx="150" cy="340" r="160" fill="rgba(0,0,0,0.14)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" font-size="170" font-weight="800" fill="rgba(255,255,255,0.92)">${letter}</text>
</svg>`;
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    };

    const PlaceholderCardImage = ({ name }: { name: string | null | undefined }) => {
      const label = (name || "Branch").trim() || "Branch";
      const letter = label[0]?.toUpperCase() || "B";
      return (
        <Svg width="100%" height="100%" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ec4899" />
              <Stop offset="0.5" stopColor="#f43f5e" />
              <Stop offset="1" stopColor="#a855f7" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="800" height="450" rx="36" fill="url(#g)" />
          <Circle cx="660" cy="110" r="120" fill="rgba(255,255,255,0.12)" />
          <Circle cx="150" cy="340" r="160" fill="rgba(0,0,0,0.14)" />
          <SvgText
            x="400"
            y="234"
            textAnchor="middle"
            fontSize="170"
            fontWeight="800"
            fill="rgba(255,255,255,0.92)"
          >
            {letter}
          </SvgText>
        </Svg>
      );
    };

    const branchImageUrl = (b: any): string => {
      const raw = (b as any)?.branchImage;
      if (typeof raw === "string" && raw.trim()) return getBranchImageUrl(raw.trim());
      return placeholderImageFor((b as any)?.name);
    };

    return (
      <View style={styles.carouselContainer}>
        {showCarouselHeader ? (
          <View style={styles.carouselHeader}>
            <MaterialCommunityIcons name="storefront" size={16} color="#ec4899" />
            <Text style={styles.carouselHeaderText}>
              {t("reservations.booking.selectBranch", { defaultValue: "Select a branch" })}
            </Text>
            {isModifying ? (
              <MaterialCommunityIcons name="lock" size={14} color="#fbbf24" style={{ marginLeft: 6 }} />
            ) : null}
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselScrollContent}
        >
          {branchesForSelection.map((b) => {
            const isSelected = branch?.id === b.id;
            const isMain = Boolean(mainBranchId && b.id === mainBranchId);
            const hasRealImage =
              typeof (b as any)?.branchImage === "string" && Boolean((b as any)?.branchImage.trim());
            const showPlaceholder = !hasRealImage || failedCarouselImages[b.id];
            const imgUri = showPlaceholder
              ? placeholderImageFor((b as any)?.name)
              : branchImageUrl(b);
            return (
              <TouchableOpacity
                key={b.id}
                style={[
                  styles.carouselCard,
                  isSelected && styles.carouselCardSelected,
                  isMain && !isSelected && styles.carouselCardMain,
                  isModifying && styles.carouselCardDisabled,
                ]}
                onPress={() => handleBranchChange(b.id)}
                disabled={isModifying}
                activeOpacity={0.85}
              >
                <View style={styles.carouselImageWrap}>
                  {showPlaceholder ? (
                    <View style={styles.carouselPlaceholderWrap}>
                      <PlaceholderCardImage name={(b as any)?.name} />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: imgUri }}
                      style={styles.carouselImage}
                      resizeMode="cover"
                      onError={() => {
                        setFailedCarouselImages((prev) => {
                          if (prev[b.id]) return prev;
                          return { ...prev, [b.id]: true };
                        });
                      }}
                    />
                  )}
                  {!showPlaceholder ? <View style={styles.carouselImageOverlay} /> : null}

                  {isMain ? (
                    <View style={styles.carouselBadgeMain}>
                      <Text style={styles.carouselBadgeMainText}>Main</Text>
                    </View>
                  ) : null}

                  {isSelected ? (
                    <View style={styles.carouselBadgeSelected}>
                      <Text style={styles.carouselBadgeSelectedText}>
                        {t("home.selected", { defaultValue: "Selected" })}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.carouselCardBody}>
                  <Text style={styles.carouselCardTitle} numberOfLines={1}>
                    {b.name || `Branch ${String(b.id).slice(0, 8)}`}
                  </Text>
                  <Text style={styles.carouselCardSubtitle} numberOfLines={2}>
                    {[b.city, b.state, b.country].filter(Boolean).join(", ") ||
                      t("home.branchCardHint", { defaultValue: "Tap to select this branch" })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isBranchUrgentlyClosed && (
          <View style={[styles.urgentBanner, { marginTop: 10, marginBottom: 0 }]}>
            <MaterialCommunityIcons name="alert-circle" size={16} color="#ef4444" style={{ marginTop: 1 }} />
            <View style={styles.urgentBannerContent}>
              <Text style={styles.urgentBannerTitle}>
                {t("branchSwitcher.urgentlyClosed", { defaultValue: "Branch Temporarily Closed" })}
              </Text>
              {urgentCloseMessage ? (
                <Text style={styles.urgentBannerMessage}>{urgentCloseMessage}</Text>
              ) : null}
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <>
      <View style={styles.wrapper}>
        <TouchableOpacity
          style={[styles.button, isModifying && styles.buttonDisabled]}
          onPress={() => !isModifying && setShowBranchPicker(true)}
          disabled={isModifying}
        >
          <View style={styles.buttonLeft}>
            <MaterialCommunityIcons name="office-building" size={16} color="#ec4899" />
            <Text style={[styles.buttonText, !branch && styles.buttonTextPlaceholder]}>
              {branch?.name || (t("reservations.booking.selectBranch") || "Select a branch")}
            </Text>
            {isModifying && (
              <MaterialCommunityIcons name="lock" size={12} color="#fbbf24" style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={styles.buttonRight}>
            {isModifying ? (
              <TouchableOpacity onPress={() => setShowCancelConfirm(true)}>
                <Text style={styles.inlineCancel}>
                  {modifyingReservationId || modifyingOrderId
                    ? (t("reservations.booking.cancelEdit") || "Cancel Edit")
                    : (t("common.cancel") || "Cancel")
                  }
                </Text>
              </TouchableOpacity>
            ) : (
              <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {isBranchUrgentlyClosed && (
        <View style={styles.urgentBanner}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#ef4444" style={{ marginTop: 1 }} />
          <View style={styles.urgentBannerContent}>
            <Text style={styles.urgentBannerTitle}>
              {t("branchSwitcher.urgentlyClosed", { defaultValue: "Branch Temporarily Closed" })}
            </Text>
            {urgentCloseMessage ? (
              <Text style={styles.urgentBannerMessage}>{urgentCloseMessage}</Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Branch Picker Modal */}
      <Modal
        visible={showBranchPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowBranchPicker(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("reservations.booking.selectBranch") || "Select Branch"}
              </Text>
              <TouchableOpacity onPress={() => setShowBranchPicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {mainBranch && (
                <>
                  <TouchableOpacity
                    style={[
                      styles.branchOption,
                      branch?.id === mainBranch.id && styles.branchOptionActive,
                    ]}
                    onPress={() => handleBranchChange(mainBranch.id)}
                  >
                    <View style={styles.branchOptionContent}>
                      <MaterialCommunityIcons name="star" size={16} color="#ec4899" />
                      <Text
                        style={[
                          styles.branchOptionText,
                          branch?.id === mainBranch.id && styles.branchOptionTextActive,
                        ]}
                      >
                        {mainBranch.name || `Branch ${mainBranch.id.slice(0, 8)}`}
                      </Text>
                      <View style={styles.mainBadge}>
                        <Text style={styles.mainBadgeText}>Main</Text>
                      </View>
                    </View>
                    {branch?.id === mainBranch.id && (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                  {otherBranches.length > 0 && <View style={styles.divider} />}
                </>
              )}
              {otherBranches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.branchOption,
                    branch?.id === b.id && styles.branchOptionActive,
                  ]}
                  onPress={() => handleBranchChange(b.id)}
                >
                  <Text
                    style={[
                      styles.branchOptionText,
                      branch?.id === b.id && styles.branchOptionTextActive,
                    ]}
                  >
                    {b.name || `Branch ${b.id.slice(0, 8)}`}
                  </Text>
                  {branch?.id === b.id && (
                    <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCancelConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelConfirm(false)}
      >
        <Pressable style={styles.confirmOverlay} onPress={() => setShowCancelConfirm(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>
              {modifyingReservationId || modifyingOrderId
                ? (t("reservations.booking.cancelEditTitle") || "Cancel editing?")
                : (t("reservations.booking.cancelReservationTitle") || "Cancel reservation?")
              }
            </Text>
            <Text style={styles.confirmSubtitle}>
              {modifyingReservationId || modifyingOrderId
                ? (t("reservations.booking.cancelEditHint") || "This will discard your changes and unlock branch selection.")
                : (t("reservations.booking.cancelReservationHint") || "This will exit reservation mode and unlock branch selection.")
              }
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowCancelConfirm(false)}>
                <Text style={styles.confirmCancelText}>
                  {t("common.keep") || "Keep"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmConfirm} onPress={handleCancelLock}>
                <Text style={styles.confirmConfirmText}>
                  {modifyingReservationId || modifyingOrderId
                    ? (t("reservations.booking.discardChanges") || "Discard changes")
                    : (t("reservations.booking.cancelReservation") || "Cancel reservation")
                  }
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // ... existing styles ...
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  carouselContainer: {
    width: "100%",
    borderColor: "#404040",
  },
  carouselHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  carouselHeaderText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  carouselScrollContent: {
    paddingHorizontal: 2,
    paddingBottom: 4,
    gap: 12,
  },
  carouselCard: {
    width: 185,
    borderRadius: 16,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },
  carouselCardSelected: {
    borderColor: "rgba(236, 72, 153, 0.7)",
  },
  carouselCardMain: {
    borderColor: "rgba(236, 72, 153, 0.25)",
  },
  carouselCardDisabled: {
    opacity: 0.7,
  },
  carouselImageWrap: {
    height: 110,
    width: "100%",
    position: "relative",
  },
  carouselPlaceholderWrap: {
    height: "100%",
    width: "100%",
  },
  carouselImage: {
    height: "100%",
    width: "100%",
  },
  carouselImageOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  carouselBadgeMain: {
    position: "absolute",
    left: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.2)",
  },
  carouselBadgeMainText: {
    color: "#fbcfe8",
    fontSize: 11,
    fontWeight: "600",
  },
  carouselBadgeSelected: {
    position: "absolute",
    right: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  carouselBadgeSelectedText: {
    color: "#bbf7d0",
    fontSize: 11,
    fontWeight: "600",
  },
  carouselCardBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  carouselCardTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  carouselCardSubtitle: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  loadingText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginLeft: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    flex: 1,
    justifyContent: "space-between",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  buttonRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  wrapper: {
    flex: 1,
    gap: 6,
  },
  lockInline: {
    marginTop: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(236, 72, 153, 0.08)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  lockInlineText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  lockInlineAction: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  inlineCancel: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  lockNotice: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(236, 72, 153, 0.08)",
    borderWidth: 1,
    borderColor: "#ec4899",
    gap: 6,
  },
  lockNoticeText: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 16,
  },
  lockNoticeButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ec4899",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  lockNoticeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 10,
  },
  confirmTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  confirmSubtitle: {
    color: "#d1d5db",
    fontSize: 13,
    lineHeight: 18,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  confirmCancel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#262626",
  },
  confirmCancelText: {
    color: "#d1d5db",
    fontSize: 13,
    fontWeight: "600",
  },
  confirmConfirm: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  confirmConfirmText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  buttonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#fff",
    flexShrink: 1,
  },
  buttonTextPlaceholder: {
    color: "#9CA3AF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  branchOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  branchOptionActive: {
    backgroundColor: "#1a1a1a",
    borderColor: "#ec4899",
  },
  branchOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  branchOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
    flex: 1,
  },
  branchOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  mainBadge: {
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mainBadgeText: {
    fontSize: 10,
    color: "#ec4899",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#262626",
    marginVertical: 8,
  },
  urgentBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  urgentBannerContent: {
    flex: 1,
  },
  urgentBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fca5a5",
  },
  urgentBannerMessage: {
    fontSize: 12,
    color: "#fca5a5",
    marginTop: 3,
    lineHeight: 16,
    opacity: 0.85,
  },
});

