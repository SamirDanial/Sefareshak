import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? "http://localhost:3001" : "https://nextfoody.com");

interface Policy {
  id: string;
  type: string;
  title: string;
  content: string;
  version: string;
  effectiveDate: string;
  isRequired: boolean;
}

interface PolicyConsentModalProps {
  visible: boolean;
  onComplete: () => void;
  onReject?: () => void; // Called when user rejects policies
  language?: string;
}

export function PolicyConsentModal({
  visible,
  onComplete,
  onReject,
  language = "en",
}: PolicyConsentModalProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [consenting, setConsenting] = useState(false);
  const [consentedPolicies, setConsentedPolicies] = useState<Set<string>>(
    new Set()
  );
  const [viewingPolicy, setViewingPolicy] = useState<Policy | null>(null);

  useEffect(() => {
    if (visible) {
      fetchRequiredPolicies();
    }
  }, [visible, language]);

  const fetchRequiredPolicies = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        onComplete();
        return;
      }

      // Use the same endpoint as AuthWrapper - get ALL active policies and filter for required ones
      // This ensures we get policies even if user has old consents
      // This is a public endpoint, no auth needed
      const response = await fetch(
        `${API_BASE_URL}/api/terms-and-policies/active/all?language=${language}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch policies");
      }

      const data = await response.json();
      if (data.success) {
        // Filter for required policies only
        const requiredPolicies = (data.data || []).filter((p: any) => p.isRequired === true);
        setPolicies(requiredPolicies);
        // If no required policies, complete immediately
        if (requiredPolicies.length === 0) {
          onComplete();
        }
      } else {
        console.error("❌ [PolicyConsentModal] Failed to fetch policies:", data);
      }
    } catch (error) {
      console.error("Error fetching required policies:", error);
      // On error, allow user to proceed (don't block them)
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  const handleConsent = async (policyId: string) => {
    try {
      setConsenting(true);
      const token = await getToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/api/user/terms-and-policies/consent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ policyId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to record consent");
      }

      setConsentedPolicies((prev) => new Set([...prev, policyId]));
    } catch (error) {
      console.error("Error recording consent:", error);
    } finally {
      setConsenting(false);
    }
  };

  const handleViewPolicy = (policy: Policy) => {
    setViewingPolicy(policy);
  };

  const handleClosePolicyView = () => {
    setViewingPolicy(null);
  };

  const handleContinue = async () => {
    // Check if all required policies have been consented to
    const allConsented = policies.every((policy) =>
      consentedPolicies.has(policy.id)
    );

    if (allConsented) {
      onComplete();
    } else {
      // Accept all policies that haven't been accepted yet
      try {
        setConsenting(true);
        const token = await getToken();
        if (!token) return;

        // Get policies that haven't been consented to
        const unconsentedPolicies = policies.filter(
          (policy) => !consentedPolicies.has(policy.id)
        );

        // Accept all unconsented policies SEQUENTIALLY to ensure backend checks happen after all are saved
        for (const policy of unconsentedPolicies) {
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/user/terms-and-policies/consent`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ policyId: policy.id }),
              }
            );

            if (response.ok) {
              const data = await response.json();
              setConsentedPolicies((prev) => new Set([...prev, policy.id]));
            } else {
              const errorData = await response.json().catch(() => ({}));
              console.error(`❌ [PolicyConsentModal] Failed to accept policy ${policy.id}:`, response.status, errorData);
            }
          } catch (error) {
            console.error(`❌ [PolicyConsentModal] Error accepting policy ${policy.id}:`, error);
          }
        }

        
        // Wait for backend to process all consents and update signature
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // After accepting all, complete
        onComplete();
      } catch (error) {
        console.error("Error accepting all policies:", error);
      } finally {
        setConsenting(false);
      }
    }
  };

  // Button is always enabled - it will accept all policies if needed
  const canContinue = policies.length > 0;
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        // Prevent closing - user must accept or reject
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("policyConsent.title")}</Text>
            <Text style={styles.subtitle}>
              {t("policyConsent.subtitle")}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#ec4899" />
              <Text style={styles.loadingText}>{t("policyConsent.loadingPolicies")}</Text>
            </View>
          ) : policies.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t("policyConsent.noRequiredPolicies")}</Text>
              <TouchableOpacity
                style={styles.continueButton}
                onPress={onComplete}
              >
                <Text style={styles.continueButtonText}>{t("policyConsent.continue")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView 
                style={styles.policiesList} 
                showsVerticalScrollIndicator={true}
                contentContainerStyle={styles.policiesListContent}
                nestedScrollEnabled={true}
              >
                {policies.map((policy) => {
                  const hasConsented = consentedPolicies.has(policy.id);
                  return (
                    <View key={policy.id} style={styles.policyCard}>
                      <View style={styles.policyHeader}>
                        <View style={styles.policyHeaderLeft}>
                          <Text style={styles.policyTitle}>{policy.title}</Text>
                          <View style={styles.policyMeta}>
                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>
                                {t(`policyConsent.policyTypeLabels.${policy.type}`) || policy.type}
                              </Text>
                            </View>
                            <Text style={styles.version}>
                              {t("policyConsent.version")} {policy.version}
                            </Text>
                          </View>
                        </View>
                        {hasConsented && (
                          <View style={styles.consentedBadge}>
                            <MaterialCommunityIcons
                              name="check-circle"
                              size={24}
                              color="#10b981"
                            />
                          </View>
                        )}
                      </View>

                      <View style={styles.contentContainer}>
                        <Text style={styles.policyContent} numberOfLines={3} ellipsizeMode="tail">
                          {policy.content ? policy.content : "No content available"}
                        </Text>
                      </View>

                      <View style={styles.policyActions}>
                        <TouchableOpacity
                          style={styles.viewButton}
                          onPress={() => handleViewPolicy(policy)}
                        >
                          <Text style={styles.viewButtonText}>{t("policyConsent.viewFullPolicy")}</Text>
                        </TouchableOpacity>
                        {!hasConsented && (
                          <TouchableOpacity
                            style={[
                              styles.acceptButton,
                              consenting && styles.acceptButtonDisabled,
                            ]}
                            onPress={() => handleConsent(policy.id)}
                            disabled={consenting}
                          >
                            {consenting ? (
                              <ActivityIndicator size="small" color="#ec4899" />
                            ) : (
                              <Text style={styles.acceptButtonText}>
                                {t("policyConsent.accept")}
                              </Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.footer}>
                {onReject && (
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => {
                      onReject();
                    }}
                  >
                    <Text style={styles.rejectButtonText}>{t("policyConsent.rejectLogout")}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.continueButton,
                    (!canContinue || consenting) && styles.continueButtonDisabled,
                    onReject && styles.continueButtonWithReject,
                  ]}
                  onPress={handleContinue}
                  disabled={!canContinue || consenting}
                  activeOpacity={0.8}
                >
                  {consenting ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.continueButtonText}>{t("policyConsent.accepting")}</Text>
                    </View>
                  ) : (
                    <Text style={styles.continueButtonText}>
                      {t("policyConsent.acceptAllContinue")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Full Policy Viewer Modal */}
      {viewingPolicy && (
        <Modal
          visible={!!viewingPolicy}
          animationType="slide"
          transparent={true}
          onRequestClose={handleClosePolicyView}
        >
          <View style={styles.policyViewerOverlay}>
            <View style={styles.policyViewerContainer}>
              <View style={styles.policyViewerHeader}>
                <Text style={styles.policyViewerTitle}>
                  {viewingPolicy.title}
                </Text>
                <TouchableOpacity
                  onPress={handleClosePolicyView}
                  style={styles.closePolicyButton}
                >
                  <MaterialCommunityIcons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.policyViewerMeta}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {t(`policyConsent.policyTypeLabels.${viewingPolicy.type}`) || viewingPolicy.type}
                  </Text>
                </View>
                <Text style={styles.version}>
                  {t("policyConsent.version")} {viewingPolicy.version}
                </Text>
                <Text style={styles.effectiveDate}>
                  {t("policyConsent.effective")}: {new Date(viewingPolicy.effectiveDate).toLocaleDateString()}
                </Text>
              </View>

              <ScrollView
                style={styles.policyViewerContent}
                contentContainerStyle={styles.policyViewerContentContainer}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.policyViewerText}>
                  {viewingPolicy.content}
                </Text>
              </ScrollView>

              <View style={styles.policyViewerFooter}>
                <TouchableOpacity
                  style={styles.closePolicyViewButton}
                  onPress={handleClosePolicyView}
                >
                  <Text style={styles.closePolicyViewButtonText}>{t("policyConsent.close")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "95%",
    paddingTop: 24,
    paddingBottom: 32,
    minHeight: 600,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#9CA3AF",
    lineHeight: 22,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: "#9CA3AF",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#9CA3AF",
    marginBottom: 24,
  },
  policiesList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: 500,
  },
  policiesListContent: {
    paddingBottom: 20,
  },
  policyCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  policyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  policyHeaderLeft: {
    flex: 1,
  },
  policyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  policyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  version: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  consentedBadge: {
    marginLeft: 12,
  },
  contentContainer: {
    marginTop: 8,
    marginBottom: 16,
    minHeight: 40,
  },
  policyContent: {
    fontSize: 14,
    color: "#fff",
    lineHeight: 20,
  },
  policyActions: {
    flexDirection: "row",
    gap: 12,
  },
  viewButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  acceptButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    gap: 12,
  },
  rejectButton: {
    backgroundColor: "transparent",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ef4444",
  },
  continueButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonWithReject: {
    marginTop: 0,
  },
  continueButtonDisabled: {
    opacity: 0.6,
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  // Policy Viewer Modal Styles
  policyViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "flex-end",
  },
  policyViewerContainer: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingTop: 24,
    paddingBottom: 32,
    flex: 1,
  },
  policyViewerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  policyViewerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginRight: 16,
  },
  closePolicyButton: {
    padding: 8,
  },
  policyViewerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    flexWrap: "wrap",
  },
  effectiveDate: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  policyViewerContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  policyViewerContentContainer: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  policyViewerText: {
    fontSize: 15,
    lineHeight: 24,
    color: "#fff",
    paddingBottom: 20,
  },
  policyViewerFooter: {
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  closePolicyViewButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  closePolicyViewButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
});

