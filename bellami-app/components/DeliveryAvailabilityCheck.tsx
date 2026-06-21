import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialIcons } from "@expo/vector-icons";
import { isWithinDeliveryRadius } from "@/src/utils/distanceCalculator";
import type { Settings } from "@/src/utils/taxCalculator";
import { Toast } from "./Toast";
import { useBranch } from "@/src/contexts/BranchContext";

// Conditionally import expo-location only if available
const getLocationModule = async () => {
  try {
    return await import("expo-location");
  } catch (e) {
    console.warn("expo-location not available:", e);
    return null;
  }
};

interface DeliveryAvailabilityCheckProps {
  settings: Settings;
  onAvailabilityConfirmed: () => void;
}

const DeliveryAvailabilityCheck: React.FC<DeliveryAvailabilityCheckProps> = ({
  settings,
  onAvailabilityConfirmed,
}) => {
  const { t } = useTranslation();
  const { branch: branchSummary, branches } = useBranch();
  const [checking, setChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [showUnavailableDialog, setShowUnavailableDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  // Find the full branch object from branches array using the branch ID
  const fullBranch = branchSummary?.id 
    ? branches.find((b) => b.id === branchSummary.id)
    : null;

  // Use branch location if available, otherwise fall back to settings
  // Handle latitude - can be number, string, or Decimal from Prisma
  const branchLat = fullBranch?.latitude !== undefined && fullBranch?.latitude !== null
    ? typeof fullBranch.latitude === "string"
      ? parseFloat(fullBranch.latitude)
      : typeof fullBranch.latitude === "number"
      ? fullBranch.latitude
      : parseFloat(String(fullBranch.latitude))
    : null;

  const settingsLat =
    settings.latitude !== undefined && settings.latitude !== null
      ? typeof settings.latitude === "string"
        ? parseFloat(settings.latitude)
        : typeof settings.latitude === "number"
        ? settings.latitude
        : parseFloat(String(settings.latitude))
      : null;

  const restaurantLat = branchLat ?? settingsLat;

  // Handle longitude - can be number, string, or Decimal from Prisma
  const branchLon = fullBranch?.longitude !== undefined && fullBranch?.longitude !== null
    ? typeof fullBranch.longitude === "string"
      ? parseFloat(fullBranch.longitude)
      : typeof fullBranch.longitude === "number"
      ? fullBranch.longitude
      : parseFloat(String(fullBranch.longitude))
    : null;

  const settingsLon =
    settings.longitude !== undefined && settings.longitude !== null
      ? typeof settings.longitude === "string"
        ? parseFloat(settings.longitude)
        : typeof settings.longitude === "number"
        ? settings.longitude
        : parseFloat(String(settings.longitude))
      : null;

  const restaurantLon = branchLon ?? settingsLon;

  const hasRestaurantLocation =
    restaurantLat !== null &&
    restaurantLon !== null &&
    !isNaN(restaurantLat) &&
    !isNaN(restaurantLon);

  // Use branch delivery radius if available, otherwise fall back to settings
  const deliveryRadius = fullBranch?.deliveryRadius ?? settings.deliveryRadius ?? 5;
  const deliveryRatePerKm = Number(settings.deliveryRatePerKilometer || 0) || 0;
  const currency = settings.currency || "USD";

  const checkDeliveryAvailability = async () => {
    const Location = await getLocationModule();

    if (!Location) {
      setErrorMessage(
        t("checkout.step1.deliveryInfo.geolocationNotSupported") +
          ": " +
          t("checkout.step1.deliveryInfo.restaurantLocationNotSet")
      );
      setShowErrorDialog(true);
      return;
    }

    if (!hasRestaurantLocation) {
      setErrorMessage(t("checkout.step1.deliveryInfo.restaurantLocationNotSet"));
      setShowErrorDialog(true);
      return;
    }

    try {
      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setErrorMessage(
          t("checkout.step1.deliveryInfo.failedToGetLocation", {
            error: "Location services are disabled. Please enable location services in your device settings.",
          })
        );
        setShowErrorDialog(true);
        return;
      }

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMessage(
          t("checkout.step1.deliveryInfo.failedToGetLocation", {
            error: "Permission denied. Please grant location permission in your device settings.",
          })
        );
        setShowErrorDialog(true);
        return;
      }

      setChecking(true);
      setIsAvailable(null);
      setDistance(null);

      const location = await Location.getCurrentPositionAsync({});
      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;

      // Calculate distance
      const R = 6371; // Earth radius in km
      const dLat = ((userLat - restaurantLat!) * Math.PI) / 180;
      const dLon = ((userLon - restaurantLon!) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((restaurantLat! * Math.PI) / 180) *
          Math.cos((userLat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const calculatedDistance = R * c;

      setDistance(calculatedDistance);

      const withinRadius = isWithinDeliveryRadius(
        userLat,
        userLon,
        restaurantLat!,
        restaurantLon!,
        deliveryRadius
      );

      setIsAvailable(withinRadius);
      setChecking(false);

      if (withinRadius) {
        setToast({
          visible: true,
          message: t("checkout.step1.deliveryInfo.deliveryAvailable", {
            distance: calculatedDistance.toFixed(2),
          }),
          type: "success",
        });
      } else {
        // Show custom dialog instead of Alert
        setShowUnavailableDialog(true);
      }
    } catch (error) {
      setChecking(false);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(
        t("checkout.step1.deliveryInfo.failedToGetLocation", {
          error: errorMsg.includes("location") && errorMsg.includes("unavailable")
            ? "Current location is unavailable. Make sure that location services are enabled."
            : errorMsg,
        })
      );
      setShowErrorDialog(true);
    }
  };

  const handleContinue = () => {
    onAvailabilityConfirmed();
  };

  // Use branch address if available, otherwise fall back to settings
  const restaurantAddress = fullBranch?.address ?? settings.businessAddress ?? t("checkout.step1.addressSelector.notSet");
  const restaurantCity = fullBranch?.city ?? settings.city ?? t("checkout.step1.addressSelector.notSet");
  const restaurantCountry = fullBranch?.country ?? settings.country ?? t("checkout.step1.addressSelector.notSet");
  const branchName = branchSummary?.name ? ` (${branchSummary.name})` : "";

  return (
    <View style={styles.card}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
      
      {/* Error Dialog */}
      <Modal
        visible={showErrorDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorDialog(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowErrorDialog(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <MaterialIcons name="error-outline" size={32} color="#ef4444" />
              </View>
              <Text style={styles.modalTitle}>
                {t("common.error")}
              </Text>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>
                {errorMessage}
              </Text>
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowErrorDialog(false)}
              >
                <Text style={styles.modalButtonText}>
                  {t("common.close") || "Close"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delivery Unavailable Dialog */}
      <Modal
        visible={showUnavailableDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnavailableDialog(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowUnavailableDialog(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <MaterialIcons name="cancel" size={32} color="#ef4444" />
              </View>
              <Text style={styles.modalTitle}>
                {t("checkout.step1.deliveryInfo.deliveryNotAvailableTitle")}
              </Text>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>
                {t("checkout.step1.deliveryInfo.deliveryNotAvailable", {
                  distance: distance !== null ? distance.toFixed(2) : "?",
                  radius: deliveryRadius,
                })}
              </Text>
              
              {/* Current Information Section */}
              <View style={styles.modalInfoSection}>
                <Text style={styles.modalInfoTitle}>
                  {t("checkout.step1.deliveryInfo.currentInformation") || "Current Information"}
                </Text>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>
                    {t("checkout.step1.deliveryInfo.restaurantLocation")}:
                  </Text>
                  <Text style={styles.modalInfoValue}>
                    {restaurantAddress}
                  </Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>
                    {t("checkout.step1.deliveryInfo.city")}:
                  </Text>
                  <Text style={styles.modalInfoValue}>
                    {restaurantCity}
                  </Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>
                    {t("checkout.step1.deliveryInfo.country")}:
                  </Text>
                  <Text style={styles.modalInfoValue}>
                    {restaurantCountry}
                  </Text>
                </View>
                
                {distance !== null && (
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>
                      {t("checkout.step1.deliveryInfo.distance") || "Distance"}:
                    </Text>
                    <Text style={styles.modalInfoValue}>
                      {distance.toFixed(2)} km
                    </Text>
                  </View>
                )}
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>
                    {t("checkout.step1.deliveryInfo.deliveryRadius")}:
                  </Text>
                  <Text style={styles.modalInfoValue}>
                    {deliveryRadius} km
                  </Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>
                    {t("checkout.step1.deliveryInfo.deliveryRate")}:
                  </Text>
                  <Text style={styles.modalInfoValue}>
                    ${deliveryRatePerKm > 0 ? deliveryRatePerKm.toFixed(2) : "0.00"}{" "}
                    {t("checkout.step1.deliveryInfo.perKilometer")}
                  </Text>
                </View>
              </View>
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowUnavailableDialog(false)}
              >
                <Text style={styles.modalButtonText}>
                  {t("common.close") || "Close"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <MaterialIcons name="place" size={20} color="#ec4899" />
          <Text style={styles.cardTitle}>
            {t("checkout.step1.deliveryInfo.title")}
          </Text>
        </View>
      </View>
      <View style={styles.content}>
        {/* Restaurant Location Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>
            {t("checkout.step1.deliveryInfo.restaurantLocation")}
            {branchName}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>
              {t("checkout.step1.deliveryInfo.address")}:
            </Text>{" "}
            {restaurantAddress}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>
              {t("checkout.step1.deliveryInfo.city")}:
            </Text>{" "}
            {restaurantCity}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>
              {t("checkout.step1.deliveryInfo.country")}:
            </Text>{" "}
            {restaurantCountry}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>
              {t("checkout.step1.deliveryInfo.deliveryRadius")}:
            </Text>{" "}
            {deliveryRadius} km
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>
              {t("checkout.step1.deliveryInfo.deliveryRate")}:
            </Text>{" "}
            ${deliveryRatePerKm > 0 ? deliveryRatePerKm.toFixed(2) : "0.00"}{" "}
            {t("checkout.step1.deliveryInfo.perKilometer")}
          </Text>
        </View>

        {/* Check Availability Section */}
        <View style={styles.checkSection}>
          <Text style={styles.checkQuestion}>
            {t("checkout.step1.deliveryInfo.checkLocationQuestion")}
          </Text>

          <TouchableOpacity
            onPress={checkDeliveryAvailability}
            disabled={checking}
            style={[styles.checkButton, checking && styles.checkButtonDisabled]}
          >
            {checking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="my-location" size={16} color="#fff" />
            )}
            <Text style={styles.checkButtonText}>
              {checking
                ? t("checkout.step1.deliveryInfo.checkingLocation")
                : t("checkout.step1.deliveryInfo.checkAvailability")}
            </Text>
          </TouchableOpacity>

          {/* Results */}
          {!checking && isAvailable !== null && (
            <View
              style={[
                styles.resultBox,
                isAvailable ? styles.resultBoxSuccess : styles.resultBoxError,
              ]}
            >
              <MaterialIcons
                name={isAvailable ? "check-circle" : "cancel"}
                size={20}
                color={isAvailable ? "#22c55e" : "#ef4444"}
              />
              <View style={styles.resultContent}>
                <Text
                  style={[
                    styles.resultTitle,
                    isAvailable
                      ? styles.resultTitleSuccess
                      : styles.resultTitleError,
                  ]}
                >
                  {isAvailable
                    ? t("checkout.step1.deliveryInfo.deliveryAvailableTitle")
                    : t(
                        "checkout.step1.deliveryInfo.deliveryNotAvailableTitle"
                      )}
                </Text>
                {distance !== null && (
                  <Text
                    style={[
                      styles.resultText,
                      isAvailable
                        ? styles.resultTextSuccess
                        : styles.resultTextError,
                    ]}
                  >
                    {t("checkout.step1.deliveryInfo.locationDistance", {
                      distance: distance.toFixed(2),
                    })}
                    {!isAvailable && (
                      <Text style={styles.resultSubtext}>
                        {"\n"}
                        {t("checkout.step1.deliveryInfo.deliveryRadiusLimit", {
                          radius: deliveryRadius,
                        })}
                      </Text>
                    )}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Continue Buttons */}
          {isAvailable === true ? (
            <TouchableOpacity
              onPress={handleContinue}
              style={styles.continueButton}
            >
              <Text style={styles.continueButtonText}>
                {t("checkout.step1.deliveryInfo.continueToAddressEntry")}
              </Text>
            </TouchableOpacity>
          ) : isAvailable === false ? (
            <View style={styles.proceedAnywaySection}>
              <Text style={styles.proceedAnywayText}>
                {t(
                  "checkout.step1.deliveryInfo.deliveryNotAvailableAtLocation"
                )}
              </Text>
              <TouchableOpacity
                onPress={handleContinue}
                style={styles.proceedAnywayButton}
              >
                <Text style={styles.proceedAnywayButtonText}>
                  {t("checkout.step1.deliveryInfo.continueToAddressEntry")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleContinue}
              style={styles.skipButton}
            >
              <Text style={styles.skipButtonText}>
                {t("checkout.step1.deliveryInfo.skipCheck")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginLeft: 8,
  },
  content: {},
  infoBox: {
    backgroundColor: "rgba(154, 161, 166, 0.1)",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#9BA1A6",
    marginBottom: 4,
  },
  infoBold: {
    fontWeight: "600",
    color: "#fff",
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginVertical: 8,
  },
  checkSection: {},
  checkQuestion: {
    fontSize: 14,
    color: "#9BA1A6",
    marginBottom: 12,
  },
  checkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ec4899",
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  checkButtonDisabled: {
    opacity: 0.6,
  },
  checkButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
  },
  resultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  resultBoxSuccess: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  resultBoxError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  resultContent: {
    flex: 1,
    marginLeft: 12,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  resultTitleSuccess: {
    color: "#22c55e",
  },
  resultTitleError: {
    color: "#ef4444",
  },
  resultText: {
    fontSize: 13,
  },
  resultTextSuccess: {
    color: "#86efac",
  },
  resultTextError: {
    color: "#fca5a5",
  },
  resultSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  continueButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  continueButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  proceedAnywaySection: {},
  proceedAnywayText: {
    fontSize: 12,
    color: "#9BA1A6",
    textAlign: "center",
    marginBottom: 8,
  },
  proceedAnywayButton: {
    borderWidth: 1,
    borderColor: "#333",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  proceedAnywayButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  skipButton: {
    borderWidth: 1,
    borderColor: "#333",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  skipButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#262626",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  modalBody: {
    marginBottom: 24,
  },
  modalMessage: {
    fontSize: 15,
    color: "#ccc",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  modalInfoSection: {
    backgroundColor: "rgba(154, 161, 166, 0.1)",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 16,
  },
  modalInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  modalInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  modalInfoLabel: {
    fontSize: 13,
    color: "#9BA1A6",
    flex: 1,
  },
  modalInfoValue: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
  modalFooter: {
    marginTop: 8,
  },
  modalButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default DeliveryAvailabilityCheck;
