import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialIcons } from "@expo/vector-icons";
import googlePlacesService from "@/src/services/googlePlacesService";
import { calculateDistance } from "@/src/utils/distanceCalculator";
import type { Settings } from "@/src/utils/taxCalculator";
import { useBranch } from "@/src/contexts/BranchContext";

// Conditionally import expo-location only if available
const getLocationModule = async () => {
  try {
    return await import("expo-location");
  } catch (e) {
    return null;
  }
};

export interface DetailedAddress {
  fullAddress: string;
  streetAddress?: string;
  postalCode?: string;
  addressType?: "HOUSE" | "BUILDING";
  houseNumber?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  extraDetails?: string;
}

interface EnhancedAddressSelectorProps {
  settings: Settings;
  selectedAddress: string;
  selectedStreetAddress?: string;
  selectedPostalCode?: string;
  selectedAddressType?: "HOUSE" | "BUILDING";
  selectedHouseNumber?: string;
  selectedBuilding?: string;
  selectedFloor?: string;
  selectedApartment?: string;
  selectedExtraDetails?: string;
  onAddressChange: (address: DetailedAddress) => void;
  onDistanceCalculated?: (distance: number | null) => void;
}

const EnhancedAddressSelector: React.FC<EnhancedAddressSelectorProps> = ({
  settings,
  selectedAddress,
  selectedStreetAddress,
  selectedPostalCode,
  selectedAddressType,
  selectedHouseNumber,
  selectedBuilding,
  selectedFloor,
  selectedApartment,
  selectedExtraDetails,
  onAddressChange,
  onDistanceCalculated,
}) => {
  const { t } = useTranslation();
  const { branch: branchSummary, branches, setAvailability } = useBranch();
  const [addressLineOne, setAddressLineOne] = useState(selectedAddress || "");
  const [postalCode, setPostalCode] = useState(selectedPostalCode || "");
  const [streetAddress, setStreetAddress] = useState(selectedStreetAddress || "");
  const [addressType, setAddressType] = useState<"HOUSE" | "BUILDING">(
    selectedAddressType || "HOUSE"
  );
  const [houseNumber, setHouseNumber] = useState(selectedHouseNumber || "");
  const [building, setBuilding] = useState(selectedBuilding || "");
  const [floor, setFloor] = useState(selectedFloor || "");
  const [apartment, setApartment] = useState(selectedApartment || "");
  const [extraDetails, setExtraDetails] = useState(selectedExtraDetails || "");
  const [addressLoading, setAddressLoading] = useState(false);
  const [filteringSuggestions, setFilteringSuggestions] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressPredictions, setAddressPredictions] = useState<Array<{ description: string; place_id: string }>>([]);
  const [filteredPredictions, setFilteredPredictions] = useState<Array<{ description: string; place_id: string }>>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  
  // Refs to prevent duplicate processing
  const isProcessingRef = useRef<boolean>(false);
  const lastProcessedAddressRef = useRef<string>("");

  // Find the full branch object from branches array using the branch ID
  const fullBranch = branchSummary?.id 
    ? branches.find((b) => b.id === branchSummary.id)
    : null;

  // Use branch data if available, otherwise fall back to settings
  const country = fullBranch?.country ?? settings.country ?? "";
  const state = fullBranch?.state ?? settings.state ?? "";
  const city = fullBranch?.city ?? settings.city ?? "";
  
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

  const latitude = branchLat ?? settingsLat ?? undefined;

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

  const longitude = branchLon ?? settingsLon ?? undefined;

  // Use branch delivery radius if available, otherwise fall back to settings
  const deliveryRadius = fullBranch?.deliveryRadius ?? settings.deliveryRadius ?? 5;

  // Update local state when selectedAddress prop changes
  useEffect(() => {
    setAddressLineOne(selectedAddress || "");
  }, [selectedAddress]);

  useEffect(() => {
    setPostalCode(selectedPostalCode || "");
  }, [selectedPostalCode]);

  useEffect(() => {
    setStreetAddress(selectedStreetAddress || "");
  }, [selectedStreetAddress]);

  useEffect(() => {
    setAddressType(selectedAddressType || "HOUSE");
  }, [selectedAddressType]);

  useEffect(() => {
    setHouseNumber(selectedHouseNumber || "");
  }, [selectedHouseNumber]);

  useEffect(() => {
    setBuilding(selectedBuilding || "");
  }, [selectedBuilding]);

  useEffect(() => {
    setFloor(selectedFloor || "");
  }, [selectedFloor]);

  useEffect(() => {
    setApartment(selectedApartment || "");
  }, [selectedApartment]);

  useEffect(() => {
    setExtraDetails(selectedExtraDetails || "");
  }, [selectedExtraDetails]);

  // Filter predictions to only show addresses within delivery range
  const filterPredictionsByDeliveryRange = useCallback(
    async (predictions: Array<{ description: string; place_id: string }>) => {
      if (
        !predictions.length ||
        !latitude ||
        !longitude ||
        !deliveryRadius
      ) {
        // If no delivery radius or coordinates, show all predictions
        setFilteredPredictions(predictions);
        const addresses = predictions.map((prediction) => prediction.description);
        setAddressSuggestions(addresses);
        return;
      }

      setFilteringSuggestions(true);
      const restaurantLat =
        typeof latitude === "string"
          ? parseFloat(latitude)
          : latitude;
      const restaurantLon =
        typeof longitude === "string"
          ? parseFloat(longitude)
          : longitude;
      const deliveryRadiusNum =
        typeof deliveryRadius === "string"
          ? parseFloat(deliveryRadius)
          : deliveryRadius;

      if (isNaN(restaurantLat) || isNaN(restaurantLon) || isNaN(deliveryRadiusNum)) {
        // If invalid coordinates/radius, show all predictions
        setFilteredPredictions(predictions);
        const addresses = predictions.map((prediction) => prediction.description);
        setAddressSuggestions(addresses);
        setFilteringSuggestions(false);
        return;
      }

      // Check each prediction to see if it's within delivery range
      const filtered: Array<{ description: string; place_id: string }> = [];
      const checkPromises = predictions.map((prediction) => {
        return new Promise<void>((resolve) => {
          if (!prediction.place_id) {
            resolve();
            return;
          }

          googlePlacesService.getPlaceDetails(prediction.place_id)
            .then((placeDetails) => {
              if (placeDetails) {
                const distance = calculateDistance(
                  restaurantLat as number,
                  restaurantLon as number,
                  placeDetails.latitude,
                  placeDetails.longitude
                );

                if (distance <= deliveryRadiusNum) {
                  filtered.push(prediction);
                }
              }
              resolve();
            })
            .catch(() => {
              // If place details lookup fails, include prediction anyway
              resolve();
            });
        });
      });

      await Promise.all(checkPromises);
      setFilteredPredictions(filtered);
      const addresses = filtered.map((prediction) => prediction.description);
      setAddressSuggestions(addresses);
      setFilteringSuggestions(false);
    },
    [latitude, longitude, deliveryRadius]
  );

  const handleAddressInputChange = useCallback(
    async (value: string) => {
      setAddressLineOne(value);
      // Update address data when full address changes
      onAddressChange({
        fullAddress: value,
        streetAddress: streetAddress || undefined,
        postalCode: postalCode || undefined,
        addressType,
        houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
        building: building || undefined,
        floor: floor || undefined,
        apartment: apartment || undefined,
        extraDetails: extraDetails || undefined,
      });

      // Clear availability if address is cleared or too short
      if (!value || value.length < 5) {
        setAvailability(null);
        if (onDistanceCalculated) {
          onDistanceCalculated(null);
        }
      }

      // Search addresses if all required fields are available (trigger on 1 character like React frontend)
      if (
        value.length >= 1 &&
        googlePlacesService.isApiKeyAvailable() &&
        country
      ) {
        setShowAddressSuggestions(true);
        setAddressLoading(true);

        try {
          const predictions = await googlePlacesService.searchAddresses(
            value,
            country,
            city,
            state || undefined,
            latitude,
            longitude,
            deliveryRadius
          );
          // Store full prediction objects
          setAddressPredictions(predictions);
          
          // Filter predictions by delivery range
          await filterPredictionsByDeliveryRange(predictions);
        } catch (error) {
          setAddressSuggestions([]);
          setAddressPredictions([]);
          setFilteredPredictions([]);
        } finally {
          setAddressLoading(false);
        }
      } else {
        setAddressSuggestions([]);
        setAddressPredictions([]);
        setFilteredPredictions([]);
        setShowAddressSuggestions(false);
        setAddressLoading(false);
      }
    },
    [
      country,
      city,
      state,
      latitude,
      longitude,
      deliveryRadius,
      streetAddress,
      postalCode,
      addressType,
      houseNumber,
      building,
      floor,
      apartment,
      extraDetails,
      onAddressChange,
      filterPredictionsByDeliveryRange,
      setAvailability,
      onDistanceCalculated,
    ]
  );

  const calculateAddressDistance = useCallback(
    async (address: string) => {
      if (!latitude || !longitude) {
        if (onDistanceCalculated) {
          onDistanceCalculated(null);
        }
        return;
      }

      const restaurantLat =
        typeof latitude === "string"
          ? parseFloat(latitude)
          : latitude;
      const restaurantLon =
        typeof longitude === "string"
          ? parseFloat(longitude)
          : longitude;

      if (isNaN(restaurantLat) || isNaN(restaurantLon)) {
        if (onDistanceCalculated) {
          onDistanceCalculated(null);
        }
        return;
      }

      // Geocode the selected address
      const coordinates = await googlePlacesService.geocodeAddress(address);

      // Auto-fill postal code + street address when user manually types an address (like web)
      if (coordinates) {
        const inferredPostal = String((coordinates as any).zipCode || "").trim();
        const inferredLine1 = String((coordinates as any).addressLineOne || "").trim();

        if (!postalCode && inferredPostal) {
          setPostalCode(inferredPostal);
        }

        if (!streetAddress && inferredLine1) {
          const inferredMatch = inferredLine1.match(/^\s*(\d+[a-zA-Z]?)\s+(.+)$/);
          const inferredHouse = inferredMatch ? String(inferredMatch[1] || "").trim() : "";
          const inferredStreet = inferredMatch ? String(inferredMatch[2] || "").trim() : inferredLine1;
          setStreetAddress(inferredStreet);
          if (addressType === "HOUSE" && !houseNumber && inferredHouse) {
            setHouseNumber(inferredHouse);
          }

          onAddressChange({
            fullAddress: addressLineOne,
            streetAddress: inferredStreet || undefined,
            postalCode: (inferredPostal || postalCode) || undefined,
            addressType,
            houseNumber:
              addressType === "HOUSE"
                ? (inferredHouse || houseNumber || undefined)
                : undefined,
            building: addressType === "BUILDING" ? building || undefined : undefined,
            floor: addressType === "BUILDING" ? floor || undefined : undefined,
            apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
            extraDetails: extraDetails || undefined,
          });
        } else if (!postalCode && inferredPostal) {
          onAddressChange({
            fullAddress: addressLineOne,
            streetAddress: streetAddress || undefined,
            postalCode: inferredPostal,
            addressType,
            houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
            building: addressType === "BUILDING" ? building || undefined : undefined,
            floor: addressType === "BUILDING" ? floor || undefined : undefined,
            apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
            extraDetails: extraDetails || undefined,
          });
        }
      }

      if (coordinates) {
        const distance = calculateDistance(
          restaurantLat as number,
          restaurantLon as number,
          coordinates.latitude,
          coordinates.longitude
        );
        
        if (onDistanceCalculated) {
          onDistanceCalculated(distance);
        }
        
        // Check if address is within delivery radius and set availability
        if (deliveryRadius && distance <= deliveryRadius) {
          // Check delivery availability via API
          try {
            const branchService = (await import("@/src/services/branchService")).default;
            const result = await branchService.checkDeliveryAvailability(
              coordinates.latitude,
              coordinates.longitude
            );
            
            if (result && result.available && result.branch) {
              setAvailability({
                available: true,
                branch: {
                  id: result.branch.id,
                  name: result.branch.name || null,
                  distanceKm: result.distance ?? distance ?? null,
                },
              });
            } else {
              setAvailability({
                available: false,
                message: result?.message || "We don't have delivery at that area at the moment",
              });
            }
          } catch (error) {
            // If API check fails, but distance is within radius, assume available
            if (distance <= deliveryRadius) {
              setAvailability({
                available: true,
                branch: {
                  id: branchSummary?.id || fullBranch?.id || "",
                  name: branchSummary?.name || fullBranch?.name || null,
                  distanceKm: distance,
                },
              });
            } else {
              setAvailability({
                available: false,
                message: "Address is outside the delivery radius",
              });
            }
          }
        } else {
          // Distance exceeds delivery radius
          setAvailability({
            available: false,
            message: `Address is ${distance.toFixed(1)} km away, but we only deliver within ${deliveryRadius} km`,
          });
        }
      } else {
        if (onDistanceCalculated) {
          onDistanceCalculated(null);
        }
        setAvailability({
          available: false,
          message: "Could not validate address location",
        });
      }
    },
    [
      latitude,
      longitude,
      onDistanceCalculated,
      deliveryRadius,
      branchSummary,
      fullBranch,
      setAvailability,
      postalCode,
      streetAddress,
      addressType,
      houseNumber,
      building,
      floor,
      apartment,
      extraDetails,
      addressLineOne,
      onAddressChange,
    ]
  );

  const handleAddressSelect = useCallback(
    async (address: string) => {
      // Prevent duplicate processing
      if (isProcessingRef.current || lastProcessedAddressRef.current === address) {
        return;
      }
      
      isProcessingRef.current = true;
      lastProcessedAddressRef.current = address;
      
      // Find matching prediction to get place_id
      const matchingPrediction = filteredPredictions.find((pred) => pred.description === address) ||
        addressPredictions.find((pred) => pred.description === address);
      
      // Check if address is from filtered list (already verified within range)
      const isFromFilteredList = filteredPredictions.some((pred) => pred.description === address);
      
      // Set the input field to exactly what the user clicked on
      setAddressLineOne(address);
      setAddressSuggestions([]);
      setAddressPredictions([]);
      setFilteredPredictions([]);
      setShowAddressSuggestions(false);
      setAddressLoading(false);
      
      // Update the address change callback with the selected address
      onAddressChange({
        fullAddress: address,
        streetAddress: streetAddress || undefined,
        postalCode: postalCode || undefined,
        addressType,
        houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
        building: building || undefined,
        floor: floor || undefined,
        apartment: apartment || undefined,
        extraDetails: extraDetails || undefined,
      });
      
      // Get place details (includes postal/street) if we have place_id
      if (matchingPrediction?.place_id) {
        const placeDetails = await googlePlacesService.getPlaceDetails(matchingPrediction.place_id);

        const inferredPostal = String((placeDetails as any)?.zipCode || "").trim();
        const inferredLine1 = String((placeDetails as any)?.addressLineOne || "").trim();
        if (placeDetails) {
          if (inferredPostal) setPostalCode(inferredPostal);
          if (inferredLine1) setStreetAddress(inferredLine1);

          const inferredMatch = inferredLine1.match(/^\s*(\d+[a-zA-Z]?)\s+(.+)$/);
          const inferredHouse = inferredMatch ? String(inferredMatch[1] || "").trim() : "";
          const inferredStreet = inferredMatch ? String(inferredMatch[2] || "").trim() : inferredLine1;
          if (inferredStreet) setStreetAddress(inferredStreet);
          if (addressType === "HOUSE" && inferredHouse) setHouseNumber(inferredHouse);

          onAddressChange({
            fullAddress: address,
            streetAddress: inferredStreet || streetAddress || undefined,
            postalCode: inferredPostal || postalCode || undefined,
            addressType,
            houseNumber:
              addressType === "HOUSE"
                ? (inferredHouse || houseNumber || undefined)
                : undefined,
            building: addressType === "BUILDING" ? building || undefined : undefined,
            floor: addressType === "BUILDING" ? floor || undefined : undefined,
            apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
            extraDetails: extraDetails || undefined,
          });
        }

        if (placeDetails && latitude && longitude) {
          const restaurantLat =
            typeof latitude === "string"
              ? parseFloat(latitude)
              : latitude;
          const restaurantLon =
            typeof longitude === "string"
              ? parseFloat(longitude)
              : longitude;

          if (!isNaN(restaurantLat) && !isNaN(restaurantLon)) {
            const distance = calculateDistance(
              restaurantLat as number,
              restaurantLon as number,
              placeDetails.latitude,
              placeDetails.longitude
            );
            
            if (onDistanceCalculated) {
              onDistanceCalculated(distance);
            }
            
            // If address is from filtered list (already verified within range), set availability
            if (isFromFilteredList) {
              setAvailability({
                available: true,
                branch: {
                  id: branchSummary?.id || fullBranch?.id || "",
                  name: branchSummary?.name || fullBranch?.name || null,
                  distanceKm: distance,
                },
              });
            } else if (placeDetails.latitude && placeDetails.longitude) {
              // Address not from filtered list, check delivery availability
              try {
                const branchService = (await import("@/src/services/branchService")).default;
                const result = await branchService.checkDeliveryAvailability(
                  placeDetails.latitude,
                  placeDetails.longitude
                );
                
                if (result && result.available && result.branch) {
                  setAvailability({
                    available: true,
                    branch: {
                      id: result.branch.id,
                      name: result.branch.name || null,
                      distanceKm: result.distance ?? distance ?? null,
                    },
                  });
                } else {
                  setAvailability({
                    available: false,
                    message: result?.message || "We don't have delivery at that area at the moment",
                  });
                }
              } catch (error) {
                // If API check fails, but we have distance, assume available if within range
                if (distance !== null && deliveryRadius && distance <= deliveryRadius) {
                  setAvailability({
                    available: true,
                    branch: {
                      id: branchSummary?.id || fullBranch?.id || "",
                      name: branchSummary?.name || fullBranch?.name || null,
                      distanceKm: distance,
                    },
                  });
                } else {
                  setAvailability({
                    available: false,
                    message: "Failed to check delivery availability. Please try again.",
                  });
                }
              }
            }
          }
        }
      } else {
        // Fallback to geocoding if no place_id
        await calculateAddressDistance(address);
      }
      
      isProcessingRef.current = false;
    },
    [onAddressChange, calculateAddressDistance, building, floor, apartment, extraDetails, filteredPredictions, addressPredictions, latitude, longitude, onDistanceCalculated, branchSummary, fullBranch, setAvailability, deliveryRadius]
  );

  // Also calculate distance when address is manually typed (debounced)
  useEffect(() => {
    if (!addressLineOne || addressLineOne.length < 5) {
      if (onDistanceCalculated) {
        onDistanceCalculated(null);
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      calculateAddressDistance(addressLineOne);
    }, 1500); // Wait 1.5 seconds after user stops typing

    return () => clearTimeout(timeoutId);
  }, [addressLineOne, calculateAddressDistance, onDistanceCalculated]);

  const handleGetCurrentLocation = useCallback(async () => {
    const Location = await getLocationModule();

    if (!Location) {
      Alert.alert(
        t("checkout.step1.deliveryInfo.geolocationNotSupported"),
        t("checkout.step1.addressSelector.googleMapsNotLoaded")
      );
      return;
    }

    try {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("checkout.step1.deliveryInfo.geolocationNotSupported"),
          t("checkout.step1.addressSelector.failedToGetLocation", {
            error: "Permission denied",
          })
        );
        return;
      }

      setGettingLocation(true);
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const components = await googlePlacesService.reverseGeocode(
          location.coords.latitude,
          location.coords.longitude
        );

        if (components) {
          // Use formatted address if available, otherwise construct from components
          let fullAddress = components.formattedAddress || "";

          if (!fullAddress && components.addressLineOne) {
            // Construct full address from components
            const parts: string[] = [];
            if (components.addressLineOne) parts.push(components.addressLineOne);
            if (components.city) parts.push(components.city);
            if (components.state) parts.push(components.state);
            if (components.country) parts.push(components.country);
            fullAddress = parts.join(", ");
          }

          if (fullAddress) {
            setAddressLineOne(fullAddress);
            setPostalCode(components.zipCode || "");
            
            // Call onAddressChange with the geocoded data
            onAddressChange({
              fullAddress: fullAddress,
              streetAddress: components.addressLineOne || undefined,
              postalCode: components.zipCode || undefined,
              addressType: addressType,
              houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
              building: building || undefined,
              floor: floor || undefined,
              apartment: apartment || undefined,
              extraDetails: extraDetails || undefined,
            });
          }
        } else {
          // Geocoding failed but we still have coordinates
          console.log("Could not determine address from coordinates");
        }
      } catch (error: any) {
        console.error("Error getting location or reverse geocoding:", error);
        // Show user-friendly error message
        if (error.message === 'Network request failed') {
          console.log("Location services require internet connection");
        } else {
          console.log("Failed to get current location");
        }
      } finally {
        setGettingLocation(false);
      }
    } catch (error) {
      setGettingLocation(false);
      Alert.alert(
        t("common.error"),
        t("checkout.step1.addressSelector.failedToGetLocation", {
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  }, [
    country,
    city,
    state,
    latitude,
    longitude,
    deliveryRadius,
    onAddressChange,
    onDistanceCalculated,
    building,
    floor,
    apartment,
    extraDetails,
  ]);

  const isDisabled =
    !city ||
    !country ||
    !googlePlacesService.isApiKeyAvailable() ||
    !latitude ||
    !longitude;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <MaterialIcons name="place" size={20} color="#ec4899" />
          <Text style={styles.cardTitle}>
            {t("checkout.step1.addressSelector.title")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleGetCurrentLocation}
          disabled={
            isDisabled ||
            gettingLocation ||
            !googlePlacesService.isApiKeyAvailable()
          }
          style={[
            styles.gpsButton,
            (isDisabled || gettingLocation) && styles.gpsButtonDisabled,
          ]}
        >
          {gettingLocation ? (
            <ActivityIndicator size="small" color="#ec4899" />
          ) : (
            <MaterialIcons name="my-location" size={16} color="#ec4899" />
          )}
          <Text style={styles.gpsButtonText}>
            {gettingLocation
              ? t("checkout.step1.addressSelector.gettingLocation")
              : t("checkout.step1.addressSelector.useGPS")}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("checkout.step1.addressSelector.country")}-
            {t("checkout.step1.addressSelector.stateProvince")}-
            {t("checkout.step1.addressSelector.city")}
          </Text>
          <View style={[styles.input, styles.inputDisabled, { justifyContent: "center" }]}>
            <Text style={{ color: "#9BA1A6" }}>
              {(country || t("checkout.step1.addressSelector.notSet")) +
                "-" +
                (state || t("checkout.step1.addressSelector.notSet")) +
                "-" +
                (city || t("checkout.step1.addressSelector.notSet"))}
            </Text>
          </View>
        </View>

        {/* Full Address - Editable with autocomplete */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("checkout.step1.addressSelector.fullAddress")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.addressInputContainer}>
            <TextInput
              style={styles.addressInput}
              value={addressLineOne}
              onChangeText={handleAddressInputChange}
              onFocus={() => {
                if (addressLineOne && addressLineOne.length >= 1 && addressSuggestions.length > 0) {
                  setShowAddressSuggestions(true);
                }
              }}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => {
                  setShowAddressSuggestions(false);
                  
                  // Only calculate distance when user leaves the input field (onBlur)
                  // Skip if we're currently processing or if this is the same address we just processed
                  if (!isProcessingRef.current && lastProcessedAddressRef.current !== addressLineOne) {
                    if (addressLineOne && addressLineOne.length >= 5) {
                      lastProcessedAddressRef.current = addressLineOne;
                      isProcessingRef.current = true;
                      calculateAddressDistance(addressLineOne).finally(() => {
                        isProcessingRef.current = false;
                      });
                    } else if (onDistanceCalculated) {
                      onDistanceCalculated(null);
                      lastProcessedAddressRef.current = "";
                    }
                  }
                }, 200);
              }}
              placeholder={t(
                "checkout.step1.addressSelector.fullAddressPlaceholder"
              )}
              placeholderTextColor="#9BA1A6"
              editable={!isDisabled}
            />
            {addressLoading && (
              <View style={styles.loadingIndicator}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            )}
            {filteringSuggestions && (
              <View style={styles.loadingIndicator}>
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            )}
          </View>
          {showAddressSuggestions && (
            <View style={styles.suggestionsContainer}>
              <ScrollView
                style={styles.suggestionsList}
                keyboardShouldPersistTaps="handled"
              >
                {addressSuggestions.length === 0 && filteringSuggestions && (
                  <View style={styles.suggestionItem}>
                    <Text style={[styles.suggestionText, { color: "#9BA1A6", textAlign: "center" }]}>
                      {t("checkout.step1.addressSelector.filteringAddresses") || "Filtering addresses within delivery range..."}
                    </Text>
                  </View>
                )}
                {addressSuggestions.map((address, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionItem}
                    onPress={() => handleAddressSelect(address)}
                  >
                    <MaterialIcons
                      name="place"
                      size={16}
                      color="#9BA1A6"
                      style={styles.suggestionIcon}
                    />
                    <Text style={styles.suggestionText}>{address}</Text>
                  </TouchableOpacity>
                ))}
                {addressSuggestions.length === 0 && !filteringSuggestions && addressPredictions.length > 0 && (
                  <View style={styles.suggestionItem}>
                    <Text style={[styles.suggestionText, { color: "#9BA1A6", textAlign: "center" }]}>
                      {t("checkout.step1.addressSelector.noAddressesInRange") || "No addresses found within delivery range"}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
          {isDisabled && (
            <Text style={styles.helperText}>
              {t("checkout.step1.addressSelector.restaurantLocationRequired")}
            </Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("checkout.step1.addressSelector.postalCode")} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={postalCode}
            onChangeText={(text) => {
              setPostalCode(text);
              onAddressChange({
                fullAddress: addressLineOne,
                streetAddress: streetAddress || undefined,
                postalCode: text || undefined,
                addressType,
                houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
                building: addressType === "BUILDING" ? building || undefined : undefined,
                floor: addressType === "BUILDING" ? floor || undefined : undefined,
                apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
                extraDetails: extraDetails || undefined,
              });
            }}
            placeholder={t("checkout.step1.addressSelector.postalCodePlaceholder")}
            placeholderTextColor="#9BA1A6"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("checkout.step1.addressSelector.streetAddress")} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={streetAddress}
            onChangeText={(text) => {
              setStreetAddress(text);
              onAddressChange({
                fullAddress: addressLineOne,
                streetAddress: text || undefined,
                postalCode: postalCode || undefined,
                addressType,
                houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
                building: addressType === "BUILDING" ? building || undefined : undefined,
                floor: addressType === "BUILDING" ? floor || undefined : undefined,
                apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
                extraDetails: extraDetails || undefined,
              });
            }}
            placeholder={t("checkout.step1.addressSelector.streetAddressPlaceholder")}
            placeholderTextColor="#9BA1A6"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("checkout.step1.addressSelector.addressType")} <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                addressType === "HOUSE" && styles.toggleButtonActive,
              ]}
              onPress={() => {
                setAddressType("HOUSE");
                setBuilding("");
                setFloor("");
                setApartment("");
                onAddressChange({
                  fullAddress: addressLineOne,
                  streetAddress: streetAddress || undefined,
                  postalCode: postalCode || undefined,
                  addressType: "HOUSE",
                  houseNumber: houseNumber || undefined,
                  building: undefined,
                  floor: undefined,
                  apartment: undefined,
                  extraDetails: extraDetails || undefined,
                });
              }}
            >
              <Text style={styles.toggleText}>
                {t("checkout.step1.addressSelector.house")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                addressType === "BUILDING" && styles.toggleButtonActive,
              ]}
              onPress={() => {
                setAddressType("BUILDING");
                setHouseNumber("");
                onAddressChange({
                  fullAddress: addressLineOne,
                  streetAddress: streetAddress || undefined,
                  postalCode: postalCode || undefined,
                  addressType: "BUILDING",
                  houseNumber: undefined,
                  building: building || undefined,
                  floor: floor || undefined,
                  apartment: apartment || undefined,
                  extraDetails: extraDetails || undefined,
                });
              }}
            >
              <Text style={styles.toggleText}>
                {t("checkout.step1.addressSelector.building")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {addressType === "HOUSE" ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t("checkout.step1.addressSelector.houseNumber")} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={houseNumber}
              onChangeText={(text) => {
                setHouseNumber(text);
                onAddressChange({
                  fullAddress: addressLineOne,
                  streetAddress: streetAddress || undefined,
                  postalCode: postalCode || undefined,
                  addressType,
                  houseNumber: text || undefined,
                  building: undefined,
                  floor: undefined,
                  apartment: undefined,
                  extraDetails: extraDetails || undefined,
                });
              }}
              placeholder={t("checkout.step1.addressSelector.houseNumberPlaceholder")}
              placeholderTextColor="#9BA1A6"
            />
          </View>
        ) : (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("checkout.step1.addressSelector.buildingName")} <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={building}
                onChangeText={(text) => {
                  setBuilding(text);
                  onAddressChange({
                    fullAddress: addressLineOne,
                    streetAddress: streetAddress || undefined,
                    postalCode: postalCode || undefined,
                    addressType,
                    houseNumber: undefined,
                    building: text || undefined,
                    floor: floor || undefined,
                    apartment: apartment || undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }}
                placeholder={t("checkout.step1.addressSelector.buildingPlaceholder")}
                placeholderTextColor="#9BA1A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("checkout.step1.addressSelector.floor")}</Text>
              <TextInput
                style={styles.input}
                value={floor}
                onChangeText={(text) => {
                  setFloor(text);
                  onAddressChange({
                    fullAddress: addressLineOne,
                    streetAddress: streetAddress || undefined,
                    postalCode: postalCode || undefined,
                    addressType,
                    houseNumber: undefined,
                    building: building || undefined,
                    floor: text || undefined,
                    apartment: apartment || undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }}
                placeholder={t("checkout.step1.addressSelector.floorPlaceholder")}
                placeholderTextColor="#9BA1A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("checkout.step1.addressSelector.apartmentUnit")}</Text>
              <TextInput
                style={styles.input}
                value={apartment}
                onChangeText={(text) => {
                  setApartment(text);
                  onAddressChange({
                    fullAddress: addressLineOne,
                    streetAddress: streetAddress || undefined,
                    postalCode: postalCode || undefined,
                    addressType,
                    houseNumber: undefined,
                    building: building || undefined,
                    floor: floor || undefined,
                    apartment: text || undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }}
                placeholder={t("checkout.step1.addressSelector.apartmentPlaceholder")}
                placeholderTextColor="#9BA1A6"
              />
            </View>
          </>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("checkout.step1.addressSelector.extraDetails")} ({t("common.optional") || "(optional)"})
          </Text>
          <TextInput
            style={styles.input}
            value={extraDetails}
            onChangeText={(text) => {
              setExtraDetails(text);
              onAddressChange({
                fullAddress: addressLineOne,
                streetAddress: streetAddress || undefined,
                postalCode: postalCode || undefined,
                addressType,
                houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
                building: addressType === "BUILDING" ? building || undefined : undefined,
                floor: addressType === "BUILDING" ? floor || undefined : undefined,
                apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
                extraDetails: text || undefined,
              });
            }}
            placeholder={t("checkout.step1.addressSelector.extraDetailsPlaceholder")}
            placeholderTextColor="#9BA1A6"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
          <Text style={styles.helperText}>
            {t("checkout.step1.addressSelector.extraDetailsHint")}
          </Text>
        </View>

        {/* Info message */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>
              {t("checkout.step1.addressSelector.note")}:
            </Text>{" "}
            {t("checkout.step1.addressSelector.addressInfoMessage", {
              city: city || "",
              radius: deliveryRadius,
            })}
          </Text>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  required: {
    color: "#ff4444",
  },
  gpsButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  gpsButtonDisabled: {
    opacity: 0.5,
  },
  gpsButtonText: {
    color: "#ec4899",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 6,
  },
  content: {},
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#fff",
  },
  inputDisabled: {
    backgroundColor: "#333",
    color: "#999",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  toggleButtonActive: {
    borderColor: "#ec4899",
  },
  toggleText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  addressInputContainer: {
    position: "relative",
  },
  addressInput: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    paddingRight: 40,
    fontSize: 15,
    color: "#fff",
  },
  loadingIndicator: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  suggestionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  suggestionIcon: {
    marginRight: 8,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  helperText: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  infoBox: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 12,
    color: "#93c5fd",
  },
  infoBold: {
    fontWeight: "600",
    color: "#60a5fa",
  },
});

export default EnhancedAddressSelector;
