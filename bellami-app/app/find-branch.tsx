import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useBranch } from "@/src/contexts/BranchContext";
import branchService, { type Branch } from "@/src/services/branchService";
import googlePlacesService from "@/src/services/googlePlacesService";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";
import { MaterialIcons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useGlobalToast } from "@/src/contexts/GlobalToastContext";

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

interface BranchWithDistance extends Branch {
  distance?: number;
  deliveryAvailable?: boolean;
}

export default function FindBranchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { branches, loadingBranches, setBranch, refreshBranches } = useBranch();
  const insets = useSafeAreaInsets();
  const { showToast } = useGlobalToast();

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [selectedAddressCoords, setSelectedAddressCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ description: string; place_id: string }>>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [branchesWithDistance, setBranchesWithDistance] = useState<
    BranchWithDistance[]
  >([]);
  const [nearestBranch, setNearestBranch] = useState<BranchWithDistance | null>(
    null
  );
  const [showList, setShowList] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [mapHtml, setMapHtml] = useState<string>("");
  const webViewRef = useRef<WebView>(null);
  const googlePlacesServiceInstance = googlePlacesService;
  const hasAutoLocatedRef = useRef(false);

  // Helper function to parse latitude/longitude (can be number, string, or Decimal from Prisma)
  const parseCoordinate = (coord: any): number | null => {
    if (coord === undefined || coord === null) {
      return null;
    }
    if (typeof coord === "number") {
      return coord;
    }
    if (typeof coord === "string") {
      const parsed = parseFloat(coord);
      return isNaN(parsed) ? null : parsed;
    }
    // Handle Decimal or other types
    const parsed = parseFloat(String(coord));
    return isNaN(parsed) ? null : parsed;
  };

  // Calculate distances and check delivery availability
  const calculateDistancesAndCheckDelivery = useCallback(
    async (lat: number, lng: number) => {
      if (branches.length === 0) return;

      const branchesWithDist: BranchWithDistance[] = branches.map((branch) => {
        // Parse latitude and longitude (handle string, number, or Decimal types)
        const branchLat = parseCoordinate(branch.latitude);
        const branchLng = parseCoordinate(branch.longitude);

        if (branchLat === null || branchLng === null) {
          return { ...branch, distance: undefined, deliveryAvailable: false };
        }

        const distance = calculateDistance(
          lat,
          lng,
          branchLat,
          branchLng
        );

        const deliveryAvailable =
          branch.deliveryRadius !== null &&
          branch.deliveryRadius !== undefined &&
          distance <= branch.deliveryRadius;

        return {
          ...branch,
          latitude: branchLat, // Use parsed values
          longitude: branchLng, // Use parsed values
          distance,
          deliveryAvailable,
        };
      });

      // Sort by distance
      branchesWithDist.sort((a, b) => {
        if (!a.distance && !b.distance) return 0;
        if (!a.distance) return 1;
        if (!b.distance) return -1;
        return a.distance - b.distance;
      });

      setBranchesWithDistance(branchesWithDist);
      const nearest = branchesWithDist[0] || null;
      setNearestBranch(nearest);
      setSelectedBranchId(nearest?.id || null);

      // Generate map HTML
      generateMapHtml(branchesWithDist, lat, lng, nearest?.id || null);
    },
    []
  );

  // Generate map HTML for WebView
  const generateMapHtml = useCallback(
    (
      branchesWithDist: BranchWithDistance[],
      userLat: number,
      userLng: number,
      nearestBranchId: string | null
    ) => {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyAmcO1fXUD4GUEZM-T8V8OQ-tBdleShpJM";
      const branchesMarkers = branchesWithDist
        .filter((b) => b.latitude && b.longitude)
        .map(
          (branch) => `
        {
          position: { lat: ${branch.latitude}, lng: ${branch.longitude} },
          title: "${(branch.name || "Branch").replace(/"/g, '\\"').replace(/'/g, "\\'")}",
          deliveryAvailable: ${branch.deliveryAvailable || false},
          isNearest: ${branch.id === nearestBranchId},
          id: "${branch.id}",
          deliveryRadius: ${branch.deliveryRadius || 0}
        }`
        )
        .join(",");

      // Calculate zoom level based on delivery radius (same as React frontend)
      let targetZoom = 12; // Default zoom
      if (branchesWithDist.length > 0) {
        // Find the maximum delivery radius
        const maxRadius = Math.max(...branchesWithDist.map(b => {
          const radius = b.deliveryRadius;
          return radius !== null && radius !== undefined ? radius : 0;
        }));
        if (maxRadius > 0) {
          // Calculate zoom based on radius * 1.5
          const targetRadius = maxRadius * 1.5;
          // Convert radius (km) to approximate zoom level
          // Rough formula: zoom decreases as radius increases
          if (targetRadius <= 2) {
            targetZoom = 15;
          } else if (targetRadius <= 5) {
            targetZoom = 14;
          } else if (targetRadius <= 10) {
            targetZoom = 13;
          } else if (targetRadius <= 20) {
            targetZoom = 12;
          } else if (targetRadius <= 50) {
            targetZoom = 11;
          } else {
            targetZoom = 10;
          }
        }
      }

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    let map;
    let markers = [];
    let circles = [];
    let userMarker;

    function initMap() {
      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: ${userLat}, lng: ${userLng} },
        zoom: ${targetZoom},
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ]
      });

      // Add user location marker (green pin)
      userMarker = new google.maps.Marker({
        position: { lat: ${userLat}, lng: ${userLng} },
        map: map,
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/green.png',
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 40)
        },
        title: 'Your Location',
        zIndex: 1000
      });

      const branches = [${branchesMarkers}];

      branches.forEach((branch) => {
        // Create marker (red pin for restaurant/branch)
        const marker = new google.maps.Marker({
          position: branch.position,
          map: map,
          icon: {
            url: 'http://maps.google.com/mapfiles/ms/icons/red.png',
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 40)
          },
          title: branch.title,
          animation: branch.isNearest ? google.maps.Animation.BOUNCE : null
        });

        marker.addListener('click', () => {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'branchClick',
              branchId: branch.id
            }));
          }
        });

        markers.push(marker);

        // Create delivery radius circle
        if (branch.deliveryRadius > 0) {
          const circle = new google.maps.Circle({
            strokeColor: branch.deliveryAvailable ? '#22c55e' : '#ef4444',
            strokeOpacity: 0.6,
            strokeWeight: 2,
            fillColor: branch.deliveryAvailable ? '#22c55e' : '#ef4444',
            fillOpacity: 0.15,
            map: map,
            center: branch.position,
            radius: branch.deliveryRadius * 1000
          });
          circles.push(circle);
        }
      });

      // Zoom is already set in map initialization, but ensure it's correct
      // Center on user location (zoom already set in initialization)
      map.setCenter({ lat: ${userLat}, lng: ${userLng} });
    }
  </script>
  <script async defer
    src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=places">
  </script>
</body>
</html>`;

      setMapHtml(html);
    },
    []
  );

  // Get user's current location
  const handleGetCurrentLocation = async () => {
    try {
      setIsGettingLocation(true);
      setLocationError(null);
      setSelectedAddress("");
      setSelectedAddressCoords(null);

      // Check permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        const errorMsg =
          t("findBranch.locationPermissionDenied") ||
          "Location permission denied. Please enable location access in your settings.";
        setLocationError(errorMsg);
        showToast(errorMsg, "error");
        setIsGettingLocation(false);
        return;
      }

      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        const errorMsg =
          t("findBranch.locationServicesDisabled") ||
          "Location services are disabled. Please enable them in your device settings.";
        setLocationError(errorMsg);
        showToast(errorMsg, "error");
        setIsGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;

      setUserLocation({ latitude: lat, longitude: lng });
      setIsGettingLocation(false);

      // Reverse geocode to get address
      const components = await googlePlacesServiceInstance.reverseGeocode(lat, lng);
      if (components) {
        setSelectedAddress(components.formattedAddress || "");
      }

      // Calculate distances and check delivery
      calculateDistancesAndCheckDelivery(lat, lng);
    } catch (error: any) {
      setIsGettingLocation(false);
      const errorMsg =
        error.message ||
        t("findBranch.locationError") ||
        "An unknown error occurred while getting your location.";
      setLocationError(errorMsg);
      showToast(errorMsg, "error");
    }
  };

  // Handle address input change with autocomplete (like React frontend)
  const handleAddressInputChange = async (text: string) => {
    setSelectedAddress(text);
    setLocationError(null);

    // Search for address suggestions using Google Places Autocomplete API
    if (text.length >= 1 && googlePlacesServiceInstance.isApiKeyAvailable()) {
      setShowAddressSuggestions(true);
      setAddressLoading(true);

      try {
        // Use Places Autocomplete API directly (global search, no country restrictions)
        // Same API as React frontend - React frontend uses ["geocode", "establishment"]
        // For REST API, omit types to get all types (geocode, establishment, etc.) like React frontend
        const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyAmcO1fXUD4GUEZM-T8V8OQ-tBdleShpJM";
        // Don't restrict types - let Google return all types (addresses, establishments, landmarks, etc.)
        // This matches the React frontend behavior which uses types: ["geocode", "establishment"]
        const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          text
        )}&key=${API_KEY}`;

        const response = await fetch(autocompleteUrl);
        const data = await response.json();

        if (data.status === "OK" && data.predictions?.length > 0) {
          const predictions = data.predictions.slice(0, 10).map((pred: any) => ({
            description: pred.description,
            place_id: pred.place_id,
          }));
          setAddressSuggestions(predictions);
        } else {
          setAddressSuggestions([]);
        }
      } catch (error) {
        console.error("Error fetching address suggestions:", error);
        setAddressSuggestions([]);
      } finally {
        setAddressLoading(false);
      }
    } else {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLoading(false);
    }
  };

  // Handle address suggestion selection
  const handleAddressSelect = async (suggestion: { description: string; place_id: string }) => {
    // Set the input field to exactly what the user clicked on (like checkout page)
    setSelectedAddress(suggestion.description);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setLocationError(null);
    setUserLocation(null); // Clear user location when address is selected

    setIsSearchingAddress(true);

    try {
      // Get place details using place_id to get coordinates
      const placeDetails = await googlePlacesServiceInstance.getPlaceDetails(suggestion.place_id);
      
      if (placeDetails) {
        setSelectedAddressCoords({
          latitude: placeDetails.latitude,
          longitude: placeDetails.longitude,
        });

        // Keep the address as the exact description the user clicked on (like checkout page)
        // Don't update with formattedAddress - user wants to see what they clicked

        // Calculate distances and check delivery
        calculateDistancesAndCheckDelivery(placeDetails.latitude, placeDetails.longitude);
        showToast(
          t("findBranch.addressFound") || "Address found!",
          "success"
        );
      } else {
        // Fallback: use geocodeAddress if getPlaceDetails fails
        const coords = await googlePlacesServiceInstance.geocodeAddress(suggestion.description);
        if (coords) {
          setSelectedAddressCoords(coords);
          // Keep the description as the address (what user clicked)
          setSelectedAddress(suggestion.description);
          calculateDistancesAndCheckDelivery(coords.latitude, coords.longitude);
          showToast(
            t("findBranch.addressFound") || "Address found!",
            "success"
          );
        } else {
          throw new Error("Could not get location for selected address");
        }
      }
    } catch (error: any) {
      const errorMsg =
        error.message ||
        t("findBranch.addressSearchError") ||
        "Failed to find the address. Please try again.";
      setLocationError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setIsSearchingAddress(false);
    }
  };

  // Handle address search (same as React frontend)
  const handleSearchAddress = async () => {
    if (!selectedAddress || selectedAddress.trim() === "") {
      showToast(
        t("findBranch.pleaseEnterAddress") || "Please enter an address to search",
        "error"
      );
      return;
    }

    setIsSearchingAddress(true);
    setLocationError(null);
    setUserLocation(null); // Clear user location when searching address

    try {
      const coords = await googlePlacesServiceInstance.geocodeAddress(selectedAddress);
      if (coords) {
        setSelectedAddressCoords(coords);
        setLocationError(null);
        // Calculate distances and check delivery
        calculateDistancesAndCheckDelivery(coords.latitude, coords.longitude);
        showToast(
          t("findBranch.addressFound") || "Address found!",
          "success"
        );
      } else {
        const errorMsg =
          t("findBranch.addressNotFound") ||
          "No results found for this address. Please try a different address.";
        setLocationError(errorMsg);
        showToast(errorMsg, "error");
      }
    } catch (error: any) {
      const errorMsg =
        error.message ||
        t("findBranch.addressSearchError") ||
        "Failed to find the address. Please try again.";
      setLocationError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setIsSearchingAddress(false);
    }
  };

  // Handle address geocoding when user finishes typing (for Enter key)
  const handleAddressGeocode = async () => {
    await handleSearchAddress();
  };

  // Handle branch selection
  const handleSelectBranch = (branch: BranchWithDistance) => {
    setBranch({
      id: branch.id,
      name: branch.name || null,
      distanceKm: branch.distance || null,
    });
    showToast(
      t("findBranch.branchSelected") ||
        `Selected ${branch.name || "branch"} successfully!`,
      "success"
    );
    router.back();
  };

  // Handle WebView messages
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "branchClick") {
        setSelectedBranchId(data.branchId);
      }
    } catch (error) {
      // Ignore parse errors
    }
  };

  // Refresh branches when component mounts
  useEffect(() => {
    refreshBranches();
  }, [refreshBranches]);

  // Automatically get user location on page load (only once)
  useEffect(() => {
    // Only run if we haven't auto-located yet and branches are loaded
    if (hasAutoLocatedRef.current || loadingBranches || branches.length === 0) {
      return;
    }

    // Set flag immediately to prevent multiple calls
    hasAutoLocatedRef.current = true;

    // Automatically get location (silent - don't show errors if permission denied)
    const autoGetLocation = async () => {
      try {
        // Check permissions first
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          // Silently fail if permission not granted (user can manually click button)
          return;
        }

        // Check if location services are enabled
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          // Silently fail if services disabled
          return;
        }

        // Get location
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = location.coords.latitude;
        const lng = location.coords.longitude;

        setUserLocation({ latitude: lat, longitude: lng });

        // Reverse geocode to get address
        const components = await googlePlacesServiceInstance.reverseGeocode(lat, lng);
        if (components) {
          setSelectedAddress(components.formattedAddress || "");
        }

        // Calculate distances and check delivery
        calculateDistancesAndCheckDelivery(lat, lng);
      } catch (error) {
        // Silently fail on auto-location - user can manually click button
        // Don't set hasAutoLocatedRef to false so we don't retry
      }
    };

    autoGetLocation();
  }, [loadingBranches, branches.length, calculateDistancesAndCheckDelivery]);

  const navbarHeight = 70;
  const headerHeight = insets.top + navbarHeight;

  return (
    <View style={styles.container}>
      {/* Custom Navbar */}
      <View style={[styles.navbar, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>
          {t("findBranch.title") || "Find a Branch"}
        </Text>
        <View style={styles.navbarRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Search Section */}
        <View style={styles.searchSection}>
          <Text style={styles.sectionTitle}>
            {t("findBranch.searchTitle") || "Search Location"}
          </Text>
          <View style={styles.searchRow}>
            <View style={styles.addressInputContainer}>
              <TextInput
                style={styles.addressInput}
                placeholder={
                  t("findBranch.addressPlaceholder") ||
                  "Enter an address or location..."
                }
                placeholderTextColor="#9BA1A6"
                value={selectedAddress}
                onChangeText={handleAddressInputChange}
                onFocus={() => {
                  if (selectedAddress && selectedAddress.length >= 1 && addressSuggestions.length > 0) {
                    setShowAddressSuggestions(true);
                  }
                }}
                onBlur={() => {
                  // Delay to allow click on suggestion
                  setTimeout(() => {
                    setShowAddressSuggestions(false);
                  }, 200);
                }}
                onSubmitEditing={handleAddressGeocode}
                returnKeyType="search"
              />
              {addressLoading && (
                <ActivityIndicator
                  size="small"
                  color="#ec4899"
                  style={styles.addressLoadingIndicator}
                />
              )}
            </View>
            {showAddressSuggestions && addressSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {addressSuggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={suggestion.place_id || index}
                    style={styles.suggestionItem}
                    onPress={() => handleAddressSelect(suggestion)}
                  >
                    <MaterialIcons name="place" size={16} color="#ec4899" />
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {suggestion.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.searchButton, isSearchingAddress && styles.buttonDisabled]}
              onPress={handleSearchAddress}
              disabled={isSearchingAddress || !selectedAddress.trim()}
            >
              {isSearchingAddress ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.searchButtonText}>
                    {t("findBranch.searching") || "Searching..."}
                  </Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="search" size={16} color="#fff" />
                  <Text style={styles.searchButtonText}>
                    {t("findBranch.searchAddress") || "Search Address"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.locationButton, isGettingLocation && styles.buttonDisabled]}
              onPress={handleGetCurrentLocation}
              disabled={isGettingLocation}
            >
              {isGettingLocation ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.locationButtonText}>
                    {t("findBranch.gettingLocation") || "Getting Location..."}
                  </Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="navigation" size={16} color="#fff" />
                  <Text style={styles.locationButtonText}>
                    {t("findBranch.useMyLocation") || "Use My Location"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {locationError && (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{locationError}</Text>
            </View>
          )}

          {(userLocation || selectedAddressCoords) && (
            <View style={styles.locationInfo}>
              <MaterialIcons name="place" size={16} color="#9BA1A6" />
              <Text style={styles.locationInfoText}>
                {selectedAddress ||
                  `${userLocation?.latitude.toFixed(4)}, ${userLocation?.longitude.toFixed(4)}`}
              </Text>
            </View>
          )}
        </View>

        {/* Map Section - Full Width */}
        <View style={styles.mapSection}>
          <View style={styles.mapSectionHeader}>
            <Text style={styles.sectionTitle}>
              {t("findBranch.mapTitle") || "Map View"}
            </Text>
          </View>
          <View style={styles.mapContainer}>
            {mapHtml ? (
              <WebView
                ref={webViewRef}
                source={{ html: mapHtml }}
                style={styles.map}
                onMessage={handleWebViewMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
              />
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mapPlaceholderText}>
                  {t("findBranch.searchOrUseLocation") ||
                    "Enter an address or use your location to find branches"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Branch List */}
        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>
              {t("findBranch.branchesTitle") || "Branches"}
            </Text>
            <TouchableOpacity
              onPress={() => setShowList(!showList)}
              style={styles.toggleButton}
            >
              {showList ? (
                <MaterialIcons name="keyboard-arrow-down" size={24} color="#ec4899" />
              ) : (
                <MaterialIcons name="keyboard-arrow-up" size={24} color="#ec4899" />
              )}
            </TouchableOpacity>
          </View>

          {showList && (
            <View style={styles.branchesList}>
              {loadingBranches ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ec4899" />
                </View>
              ) : branchesWithDistance.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="store" size={48} color="#9BA1A6" />
                  <Text style={styles.emptyText}>
                    {userLocation || selectedAddressCoords
                      ? t("findBranch.noBranchesFound") ||
                        "No branches found near this location"
                      : t("findBranch.searchOrUseLocation") ||
                        "Enter an address or use your location to find branches"}
                  </Text>
                </View>
              ) : (
                branchesWithDistance.map((branch) => {
                  if (!branch.latitude || !branch.longitude) return null;

                  return (
                    <TouchableOpacity
                      key={branch.id}
                      style={[
                        styles.branchCard,
                        selectedBranchId === branch.id && styles.branchCardSelected,
                        branch.deliveryAvailable
                          ? styles.branchCardAvailable
                          : styles.branchCardUnavailable,
                      ]}
                      onPress={() => {
                        setSelectedBranchId(branch.id);
                      }}
                    >
                      <View style={styles.branchCardHeader}>
                        <View style={styles.branchCardInfo}>
                          <Text style={styles.branchName}>
                            {branch.name || `Branch ${branch.id.slice(0, 8)}`}
                          </Text>
                          {branch.address && (
                            <Text style={styles.branchAddress}>
                              {branch.address}
                            </Text>
                          )}
                        </View>
                        {branch.deliveryAvailable ? (
                          <MaterialIcons name="check-circle" size={20} color="#22c55e" />
                        ) : (
                          <MaterialIcons name="cancel" size={20} color="#ef4444" />
                        )}
                      </View>

                      <View style={styles.branchBadges}>
                        {branch.distance !== undefined && (
                          <View style={styles.badge}>
                            <MaterialIcons name="place" size={12} color="#ec4899" />
                            <Text style={styles.badgeText}>
                              {branch.distance.toFixed(2)} km
                            </Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.badge,
                            branch.deliveryAvailable
                              ? styles.badgeAvailable
                              : styles.badgeUnavailable,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              branch.deliveryAvailable
                                ? styles.badgeTextAvailable
                                : styles.badgeTextUnavailable,
                            ]}
                          >
                            {branch.deliveryAvailable
                              ? t("findBranch.deliveryAvailable") ||
                                "Delivery Available"
                              : t("findBranch.deliveryNotAvailable") ||
                                "Delivery Not Available"}
                          </Text>
                        </View>
                        {branch.deliveryRadius !== null &&
                          branch.deliveryRadius !== undefined && (
                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>
                                {t("findBranch.radius") || "Radius"}:{" "}
                                {branch.deliveryRadius} km
                              </Text>
                            </View>
                          )}
                      </View>

                      <TouchableOpacity
                        style={styles.selectButton}
                        onPress={() => handleSelectBranch(branch)}
                      >
                        <Text style={styles.selectButtonText}>
                          {t("findBranch.selectBranch") || "Select Branch"}
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
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
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#151718",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
    zIndex: 1000,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  navbarTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    marginHorizontal: 16,
  },
  navbarRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 20,
  },
  searchSection: {
    padding: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 12,
  },
  searchRow: {
    marginBottom: 12,
    position: "relative",
    zIndex: 10,
  },
  addressInputContainer: {
    position: "relative",
    width: "100%",
  },
  addressInput: {
    width: "100%",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    padding: 12,
    paddingRight: 40,
    color: "#ffffff",
    fontSize: 14,
  },
  addressLoadingIndicator: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
  suggestionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    gap: 8,
  },
  suggestionText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  searchButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  searchButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  locationButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  locationButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    opacity: 0.1,
    borderWidth: 1,
    borderColor: "#ef4444",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    flex: 1,
  },
  locationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  locationInfoText: {
    color: "#9BA1A6",
    fontSize: 12,
  },
  mapSection: {
    marginTop: 8,
  },
  mapSectionHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  mapContainer: {
    width: "100%",
    height: 400,
    backgroundColor: "#262626",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#1a1a1a",
  },
  mapPlaceholderText: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 8,
  },
  mapPlaceholderSubtext: {
    color: "#ec4899",
    fontSize: 14,
    textAlign: "center",
  },
  listSection: {
    padding: 16,
    paddingTop: 8,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  toggleButton: {
    padding: 4,
  },
  branchesList: {
    gap: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#9BA1A6",
    fontSize: 14,
    textAlign: "center",
    marginTop: 16,
  },
  branchCard: {
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
    borderColor: "#404040",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  branchCardSelected: {
    borderColor: "#ec4899",
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
  },
  branchCardAvailable: {
    borderColor: "#22c55e",
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
  },
  branchCardUnavailable: {
    borderColor: "#ef4444",
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
  },
  branchCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  branchCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  branchName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 4,
  },
  branchAddress: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  branchBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeAvailable: {
    borderColor: "#22c55e",
    backgroundColor: "#1a1a1a",
  },
  badgeUnavailable: {
    borderColor: "#ef4444",
    backgroundColor: "#1a1a1a",
  },
  badgeText: {
    fontSize: 12,
    color: "#ffffff",
    fontWeight: "500",
  },
  badgeTextAvailable: {
    color: "#22c55e",
  },
  badgeTextUnavailable: {
    color: "#ef4444",
  },
  selectButton: {
    backgroundColor: "#ec4899",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  selectButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});

