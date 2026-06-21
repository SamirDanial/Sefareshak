import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Icon from "@mdi/react";
import { mdiMapMarker, mdiNavigation, mdiLoading } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import googlePlacesService from "@/services/googlePlacesService";
import type { Settings } from "@/services/settingsService";
import { calculateDistance } from "@/utils/distanceCalculator";
import { useTranslation } from "react-i18next";
import branchService from "@/services/branchService";
import { useBranch } from "@/contexts/BranchContext";

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
  onAddressChange: (address: DetailedAddress) => void;
  onDistanceCalculated?: (distance: number | null) => void;
  initialStreetAddress?: string;
  initialPostalCode?: string;
  initialAddressType?: "HOUSE" | "BUILDING";
  initialHouseNumber?: string;
  initialBuilding?: string;
  initialFloor?: string;
  initialApartment?: string;
  initialExtraDetails?: string;
}

const EnhancedAddressSelector: React.FC<EnhancedAddressSelectorProps> = ({
  settings,
  selectedAddress,
  onAddressChange,
  onDistanceCalculated,
  initialStreetAddress = "",
  initialPostalCode = "",
  initialAddressType = "HOUSE",
  initialHouseNumber = "",
  initialBuilding = "",
  initialFloor = "",
  initialApartment = "",
  initialExtraDetails = "",
}) => {
  const { t } = useTranslation();
  const { branch: branchSummary, branches, setAvailability } = useBranch();
  
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
  
  // Memoize branch data to prevent recalculation on every render
  const branchData = React.useMemo(() => ({
    country,
    state,
    city,
    latitude,
    longitude,
    deliveryRadius,
  }), [country, state, city, latitude, longitude, deliveryRadius]);
  
  const [addressLineOne, setAddressLineOne] = useState(selectedAddress || "");
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [streetAddress, setStreetAddress] = useState(initialStreetAddress);
  const [streetAddressError, setStreetAddressError] = useState<string>("");
  const [addressType, setAddressType] = useState<"HOUSE" | "BUILDING">(initialAddressType);
  const [houseNumber, setHouseNumber] = useState(initialHouseNumber);
  const [building, setBuilding] = useState(initialBuilding);
  const [floor, setFloor] = useState(initialFloor);
  const [apartment, setApartment] = useState(initialApartment);
  const [extraDetails, setExtraDetails] = useState(initialExtraDetails);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressPredictions, setAddressPredictions] = useState<any[]>([]); // Store full prediction objects with place_id
  const [filteredPredictions, setFilteredPredictions] = useState<any[]>([]); // Store predictions that are within delivery range
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [filteringSuggestions, setFilteringSuggestions] = useState(false);
  const autocompleteServiceRef = React.useRef<any>(null);
  const lastProcessedAddressRef = React.useRef<string>(""); // Track last processed address to prevent duplicate calls
  const isProcessingRef = React.useRef<boolean>(false); // Track if we're currently processing

  const extractStreetPartsFromPlace = useCallback((place: any) => {
    const comps = (place?.address_components || []) as any[];
    const route =
      comps.find((c) => Array.isArray(c.types) && c.types.includes("route"))?.long_name ||
      "";
    const streetNumber =
      comps.find((c) => Array.isArray(c.types) && c.types.includes("street_number"))
        ?.long_name || "";
    const postal =
      comps.find((c) => Array.isArray(c.types) && c.types.includes("postal_code"))
        ?.long_name || "";
    return {
      route: String(route || "").trim(),
      streetNumber: String(streetNumber || "").trim(),
      postalCode: String(postal || "").trim(),
    };
  }, []);

  const splitStreetAndHouse = useCallback((value: string) => {
    const v = String(value || "").trim();
    // If stored as "23 Theatergasse" (number first), flip it.
    const leading = v.match(/^\s*(\d+[a-zA-Z]?)\s+(.+)$/);
    if (leading) {
      const house = String(leading[1] || "").trim();
      const street = String(leading[2] || "").trim();
      return { street, house };
    }
    // If stored as "Theatergasse 23" (number last), split it.
    const trailing = v.match(/^(.+?)\s+(\d+[a-zA-Z]?)\s*$/);
    if (trailing) {
      const street = String(trailing[1] || "").trim();
      const house = String(trailing[2] || "").trim();
      return { street, house };
    }
    return { street: v, house: "" };
  }, []);

  // Load Google script
  useEffect(() => {
    googlePlacesService.loadScript(() => {
      setGoogleLoaded(true);
    });
  }, []);

  // Initialize AutocompleteService when Google is loaded
  useEffect(() => {
    if (googleLoaded && window.google && window.google.maps && window.google.maps.places) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    }
  }, [googleLoaded]);

  const validateStreetAddress = useCallback(async (): Promise<void> => {
    if (!googleLoaded || !window.google?.maps?.Geocoder) return;
    if (!streetAddress || !postalCode || !branchData.country || !branchData.city) return;

    const geocoder = new window.google.maps.Geocoder();
    const query = `${streetAddress}, ${postalCode}, ${branchData.city}, ${branchData.country}`;

    return new Promise<void>((resolve) => {
      geocoder.geocode({ address: query }, (results: any, status: any) => {
        try {
          if (status !== window.google.maps.GeocoderStatus.OK || !results || !results[0]) {
            setStreetAddressError(
              t("checkout.step1.addressSelector.streetAddressInvalid") ||
                "Street address could not be validated"
            );
            resolve();
            return;
          }

          const r = results[0];
          const comps = (r.address_components || []) as any[];
          const hasRoute = comps.some((c) => Array.isArray(c.types) && c.types.includes("route"));
          const geoPostal = comps.find(
            (c) => Array.isArray(c.types) && c.types.includes("postal_code")
          )?.long_name;

          if (!hasRoute || (geoPostal && String(geoPostal) !== String(postalCode))) {
            setStreetAddressError(
              t("checkout.step1.addressSelector.streetAddressInvalid") ||
                "Street address could not be validated"
            );
            resolve();
            return;
          }

          setStreetAddressError("");
          resolve();
        } catch {
          setStreetAddressError(
            t("checkout.step1.addressSelector.streetAddressInvalid") ||
              "Street address could not be validated"
          );
          resolve();
        }
      });
    });
  }, [googleLoaded, streetAddress, postalCode, branchData, t]);

  const handleAddressInputChange = useCallback(
    (value: string) => {
      setAddressLineOne(value);
      // Update address data when full address changes
      onAddressChange({
        fullAddress: value,
        streetAddress: streetAddress || undefined,
        postalCode: postalCode || undefined,
        addressType,
        houseNumber: houseNumber || undefined,
        building: building || undefined,
        floor: floor || undefined,
        apartment: apartment || undefined,
        extraDetails: extraDetails || undefined,
      });

      // Search addresses using AutocompleteService with location biasing
      if (
        value.length >= 1 &&
        googleLoaded &&
        autocompleteServiceRef.current &&
        branchData.country
      ) {
        setShowAddressSuggestions(true);
        setAddressLoading(true);

        // Get country code first
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode(
          { address: branchData.country },
          (countryResults: any[], countryStatus: string) => {
            if (
              countryStatus === window.google.maps.GeocoderStatus.OK &&
              countryResults &&
              countryResults.length > 0
            ) {
              const countryResult = countryResults.find((result: any) =>
                result.types.includes("country")
              );

              if (countryResult) {
                const countryComponent = countryResult.address_components.find(
                  (component: any) => component.types.includes("country")
                );
                const countryCode = countryComponent?.short_name?.toLowerCase();

                if (countryCode && autocompleteServiceRef.current) {
                  // Prepare request with location biasing
                  // Don't restrict types - let Google return all types (addresses, establishments, landmarks, etc.)
                  // This matches what Google Maps does - it shows everything including POIs, landmarks, etc.
                  const request: any = {
                    input: value,
                    componentRestrictions: { country: countryCode },
                    // Don't specify types - this allows all types including establishments, landmarks, etc.
                    // This is what makes Google Maps show "dasht-e-barchi, telegraph station" type results
                  };

                  // Add location biasing if branch coordinates are available
                  // Note: We use biasing (not strict filtering) to show more results like Google Maps
                  if (
                    branchData.latitude !== undefined &&
                    branchData.longitude !== undefined
                  ) {
                    const restaurantLat = typeof branchData.latitude === "string"
                      ? parseFloat(branchData.latitude)
                      : branchData.latitude;
                    const restaurantLon = typeof branchData.longitude === "string"
                      ? parseFloat(branchData.longitude)
                      : branchData.longitude;

                    if (!isNaN(restaurantLat) && !isNaN(restaurantLon)) {
                      // Use location and radius for biasing (not strict filtering)
                      // This biases results towards the branch location but doesn't exclude results outside
                      request.location = new window.google.maps.LatLng(restaurantLat, restaurantLon);
                      // Use a larger radius for biasing to show more results (like Google Maps does)
                      // This is just for biasing, not filtering
                      request.radius = 50000; // 50km radius for biasing (much larger than delivery radius)
                    }
                  }

                  // Get place predictions
                  autocompleteServiceRef.current.getPlacePredictions(
                    request,
                    async (predictions: any[], status: string) => {
                      setAddressLoading(false);
                      if (
                        status === window.google.maps.places.PlacesServiceStatus.OK &&
                        predictions &&
                        predictions.length > 0
                      ) {
                        // Store full prediction objects (with place_id) for later use
                        setAddressPredictions(predictions);
                        
                        // Filter predictions to only show addresses within delivery range
                        await filterPredictionsByDeliveryRange(predictions);
      } else {
        setAddressSuggestions([]);
                        setAddressPredictions([]);
                        setFilteredPredictions([]);
                      }
                    }
                  );
                } else {
                  setAddressLoading(false);
                  setAddressSuggestions([]);
                }
              } else {
                setAddressLoading(false);
                setAddressSuggestions([]);
              }
            } else {
              setAddressLoading(false);
              setAddressSuggestions([]);
            }
          }
        );
      } else {
        setAddressSuggestions([]);
        setAddressPredictions([]);
        setShowAddressSuggestions(false);
        setAddressLoading(false);
      }
    },
    [
      googleLoaded,
      branchData,
      postalCode,
      streetAddress,
      addressType,
      houseNumber,
      building,
      floor,
      apartment,
      onAddressChange,
    ]
  );

  // Filter predictions to only show addresses within delivery range
  const filterPredictionsByDeliveryRange = useCallback(
    async (predictions: any[]) => {
      if (
        !predictions.length ||
        !branchData.latitude ||
        !branchData.longitude ||
        !branchData.deliveryRadius ||
        !googleLoaded
      ) {
        // If no delivery radius or coordinates, show all predictions
        setFilteredPredictions(predictions);
        const addresses = predictions.map((prediction) => prediction.description);
        setAddressSuggestions(addresses);
        return;
      }

      setFilteringSuggestions(true);
      const restaurantLat = typeof branchData.latitude === "string"
        ? parseFloat(branchData.latitude)
        : branchData.latitude;
      const restaurantLon = typeof branchData.longitude === "string"
        ? parseFloat(branchData.longitude)
        : branchData.longitude;
      const deliveryRadius = typeof branchData.deliveryRadius === "string"
        ? parseFloat(branchData.deliveryRadius)
        : branchData.deliveryRadius;

      if (isNaN(restaurantLat) || isNaN(restaurantLon) || isNaN(deliveryRadius)) {
        // If invalid coordinates/radius, show all predictions
        setFilteredPredictions(predictions);
        const addresses = predictions.map((prediction) => prediction.description);
        setAddressSuggestions(addresses);
        setFilteringSuggestions(false);
        return;
      }

      const placesService = new window.google.maps.places.PlacesService(
        document.createElement("div")
      );

      // Check each prediction to see if it's within delivery range
      const filtered: any[] = [];
      const checkPromises = predictions.map((prediction) => {
        return new Promise<void>((resolve) => {
          if (!prediction.place_id) {
            resolve();
            return;
          }

          placesService.getDetails(
            {
              placeId: prediction.place_id,
              fields: ["geometry"],
            },
            (place: any, placeStatus: string) => {
              if (
                placeStatus === window.google.maps.places.PlacesServiceStatus.OK &&
                place &&
                place.geometry &&
                place.geometry.location
              ) {
                const location = place.geometry.location;
                const addressLat =
                  typeof location.lat === "function"
                    ? location.lat()
                    : location.lat;
                const addressLon =
                  typeof location.lng === "function"
                    ? location.lng()
                    : location.lng;

                if (
                  typeof addressLat === "number" &&
                  typeof addressLon === "number" &&
                  !isNaN(addressLat) &&
                  !isNaN(addressLon)
                ) {
                  const distance = calculateDistance(
                    restaurantLat,
                    restaurantLon,
                    addressLat,
                    addressLon
                  );

                  if (distance <= deliveryRadius) {
                    filtered.push(prediction);
                  }
                }
              }
              resolve();
            }
          );
        });
      });

      await Promise.all(checkPromises);
      setFilteredPredictions(filtered);
      const addresses = filtered.map((prediction) => prediction.description);
      setAddressSuggestions(addresses);
      setFilteringSuggestions(false);

      // Don't show toast when filtering - it's too noisy during typing
      // Only show warning if no addresses found at all
      if (filtered.length === 0 && predictions.length > 0) {
        toast.warning(
          t("checkout.step1.addressSelector.noAddressesInRange") ||
            "No addresses found within delivery range. Please try a different address.",
          {
            duration: 4000,
          }
        );
      }
    },
    [branchData, googleLoaded, t, calculateDistance]
  );

  const calculateAddressDistance = useCallback(
    async (address: string): Promise<void> => {
      if (
        !branchData.latitude ||
        !branchData.longitude ||
        !googleLoaded ||
        !onDistanceCalculated
      ) {
        return Promise.resolve();
      }

      const restaurantLat = typeof branchData.latitude === "string"
        ? parseFloat(branchData.latitude)
        : branchData.latitude;
      const restaurantLon = typeof branchData.longitude === "string"
        ? parseFloat(branchData.longitude)
        : branchData.longitude;

      if (isNaN(restaurantLat) || isNaN(restaurantLon)) {
        onDistanceCalculated(null);
        return Promise.resolve();
      }

      // Geocode the selected address
      const geocoder = new window.google.maps.Geocoder();

      // Use the address as-is if it looks like a full address (contains city or state)
      // Otherwise append city, state, and country from branch data
      const isFullAddress =
        address.includes(branchData.city || "") ||
        (branchData.state && address.includes(branchData.state));

      const searchQuery = isFullAddress
        ? address
        : `${address}, ${branchData.city}, ${
            branchData.state ? branchData.state + ", " : ""
          }${branchData.country}`;

      return new Promise<void>((resolve) => {
      geocoder.geocode(
        { address: searchQuery },
        async (results: any, status: any) => {
            try {
          if (
            status === window.google.maps.GeocoderStatus.OK &&
            results &&
            results.length > 0
          ) {
                const result = results[0];
                const location = result.geometry.location;

                // Auto-fill postal code from geocoding result when user manually types an address.
                // Only fill if user hasn't already entered a postal code.
                if (!postalCode && result.address_components) {
                  const postalComponent = (result.address_components as any[]).find(
                    (c: any) => Array.isArray(c.types) && c.types.includes("postal_code")
                  );
                  const inferredPostal = postalComponent?.long_name;
                  if (typeof inferredPostal === "string" && inferredPostal.trim().length > 0) {
                    setPostalCode(inferredPostal);
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

            const addressLat =
              typeof location.lat === "function"
                ? location.lat()
                : location.lat;
            const addressLon =
              typeof location.lng === "function"
                ? location.lng()
                : location.lng;

                // Don't update the address automatically while typing
                // Only calculate distance - the address will be updated when user selects a suggestion

            // Calculate distance
            const distance = calculateDistance(
              restaurantLat,
              restaurantLon,
              addressLat,
              addressLon
            );

            onDistanceCalculated(distance);

            // Check delivery availability (nearest branch)
            try {
              const result = await branchService.checkDeliveryAvailability(
                addressLat,
                addressLon
              );
                  if (result && result.available && result.branch) {
                    setAvailability({
                      available: true,
                      branch: {
                        id: result.branch.id,
                        name: result.branch.name,
                        distanceKm: result.distance ?? null,
                      },
                    });
                    toast.success(
                      t("checkout.step1.addressSelector.deliveryAvailable", {
                        distance: result.distance?.toFixed(1) || "?",
                      }) || `Delivery available! Distance: ${result.distance?.toFixed(1) || "?"} km`,
                      {
                        duration: 3000,
                      }
                    );
                  } else if (result) {
                    const errorMessage = result.message || 
                      t("checkout.step1.addressSelector.deliveryNotAvailable") ||
                      "We don't have delivery at that area at the moment";
                    setAvailability({
                      available: false,
                      message: errorMessage,
                    });
                    toast.error(errorMessage, {
                      duration: 5000,
                      style: {
                        background: "rgba(239, 68, 68, 0.9)",
                        color: "#ffffff",
                        border: "1px solid rgba(239, 68, 68, 0.5)",
                        borderRadius: "12px",
                        boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
                      },
                    });
                  }
            } catch (error) {
              console.error("Delivery availability check failed", error);
                  const errorMessage = t("checkout.step1.addressGeocodingFailed") ||
                    "Failed to check delivery availability. Please try again.";
              setAvailability({
                available: false,
                    message: errorMessage,
                  });
                  toast.error(errorMessage, {
                    duration: 5000,
                    style: {
                      background: "rgba(239, 68, 68, 0.9)",
                      color: "#ffffff",
                      border: "1px solid rgba(239, 68, 68, 0.5)",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
                    },
              });
            }
          } else {
            onDistanceCalculated(null);
            setAvailability({
              available: false,
              message: t("checkout.step1.addressGeocodingFailed"),
            });
              }
            } finally {
              resolve();
          }
        }
      );
      });
    },
    [
      branchData,
      googleLoaded,
      onDistanceCalculated,
      setAvailability,
      t,
      postalCode,
      onAddressChange,
      addressLineOne,
      addressType,
      houseNumber,
      building,
      floor,
      apartment,
      extraDetails,
    ]
  );

  // If an address is prefilled (e.g. order modification flow), automatically calculate distance
  // so delivery fee and tax can be displayed in checkout summary.
  useEffect(() => {
    if (!selectedAddress) return;

    setAddressLineOne(selectedAddress);

    if (!onDistanceCalculated) return;
    if (!googleLoaded) return;
    if (!branchData.latitude || !branchData.longitude) return;

    if (
      !isProcessingRef.current &&
      selectedAddress.length >= 5 &&
      lastProcessedAddressRef.current !== selectedAddress
    ) {
      lastProcessedAddressRef.current = selectedAddress;
      isProcessingRef.current = true;
      calculateAddressDistance(selectedAddress).finally(() => {
        isProcessingRef.current = false;
      });
    }
  }, [selectedAddress, googleLoaded, branchData, onDistanceCalculated, calculateAddressDistance]);

  const handleAddressSelect = useCallback(
    async (address: string) => {
      // Prevent duplicate processing
      if (isProcessingRef.current || lastProcessedAddressRef.current === address) {
        return;
      }
      
      isProcessingRef.current = true;
      lastProcessedAddressRef.current = address;
      
      // Check if address is from filtered list and find matching prediction BEFORE clearing state
      const isFromFilteredList = filteredPredictions.length > 0 && 
        filteredPredictions.some((pred) => pred.description === address);
      const matchingPrediction = isFromFilteredList
        ? filteredPredictions.find((pred) => pred.description === address)
        : addressPredictions.find((pred) => pred.description === address);
      
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
        houseNumber: houseNumber || undefined,
        building: building || undefined,
        floor: floor || undefined,
        apartment: apartment || undefined,
        extraDetails: extraDetails || undefined,
      });
      
      // Get full place details for the selected address in the background
      // This is for distance calculation and delivery availability, not for changing the input
      if (googleLoaded && window.google && window.google.maps && window.google.maps.places) {
        const placesService = new window.google.maps.places.PlacesService(
          document.createElement("div")
        );
        
        if (matchingPrediction && matchingPrediction.place_id) {
          // Use the place_id directly from the prediction - this is the most accurate way
          const placeId = matchingPrediction.place_id;
          
          // Get place details using place_id
          placesService.getDetails(
            {
              placeId: placeId,
              fields: [
                "address_components",
                "formatted_address",
                "geometry",
                "name",
              ],
            },
            (place: any, placeStatus: string) => {
              if (
                placeStatus === window.google.maps.places.PlacesServiceStatus.OK &&
                place
              ) {
                // Extract address components for distance calculation
                const components = googlePlacesService.extractAddressComponents(place);

                const parts = extractStreetPartsFromPlace(place);
                const inferredRoute = parts.route;
                const inferredHouseNo = parts.streetNumber;

                const inferredPostal = components.zipCode;
                const inferredStreet = inferredRoute;
                if (inferredPostal) {
                  setPostalCode(inferredPostal);

                  // Persist the postal code into checkout state.
                  // We intentionally keep the user's selected fullAddress text.
                  onAddressChange({
                    fullAddress: address,
                    streetAddress: inferredStreet || streetAddress || undefined,
                    postalCode: inferredPostal,
                    addressType,
                    houseNumber:
                      addressType === "HOUSE"
                        ? inferredHouseNo || houseNumber || undefined
                        : undefined,
                    building: addressType === "BUILDING" ? building || undefined : undefined,
                    floor: addressType === "BUILDING" ? floor || undefined : undefined,
                    apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }

                if (typeof inferredStreet === "string" && inferredStreet.trim().length > 0) {
                  setStreetAddress(inferredStreet);
                }

                if (typeof inferredHouseNo === "string" && inferredHouseNo.trim().length > 0) {
                  setHouseNumber(inferredHouseNo);
                }
                
                // Don't change the input field - keep what user selected
                // Just use components for distance and delivery availability

                // Calculate distance
                let calculatedDistance: number | null = null;
                if (
                  components.latitude &&
                  components.longitude &&
                  onDistanceCalculated &&
                  branchData.latitude !== undefined &&
                  branchData.longitude !== undefined
                ) {
                  const restaurantLat = typeof branchData.latitude === "string"
                    ? parseFloat(branchData.latitude)
                    : branchData.latitude;
                  const restaurantLon = typeof branchData.longitude === "string"
                    ? parseFloat(branchData.longitude)
                    : branchData.longitude;

                  if (
                    !isNaN(restaurantLat) &&
                    !isNaN(restaurantLon) &&
                    typeof components.latitude === "number" &&
                    typeof components.longitude === "number"
                  ) {
                    calculatedDistance = calculateDistance(
                      restaurantLat,
                      restaurantLon,
                      components.latitude,
                      components.longitude
                    );
                    onDistanceCalculated(calculatedDistance);
                  }
                }

                // If address is from filtered list (already verified within range), skip API call
                if (isFromFilteredList) {
                  // Address is already verified to be within range during filtering
                  if (calculatedDistance !== null) {
                    // We have distance, set availability with distance
                    setAvailability({
                      available: true,
                      branch: {
                        id: branchSummary?.id || fullBranch?.id || "",
                        name: branchSummary?.name || fullBranch?.name || "",
                        distanceKm: calculatedDistance,
                      },
                    });
                    toast.success(
                      t("checkout.step1.addressSelector.deliveryAvailable", {
                        distance: calculatedDistance.toFixed(1),
                      }) || `Delivery available! Distance: ${calculatedDistance.toFixed(1)} km`,
                      {
                        duration: 3000,
                      }
                    );
                  } else {
                    // Distance calculation failed, but we know it's within range from filtering
                    // Set availability without distance
                    setAvailability({
                      available: true,
                      branch: {
                        id: branchSummary?.id || fullBranch?.id || "",
                        name: branchSummary?.name || fullBranch?.name || "",
                        distanceKm: null,
                      },
                    });
                    toast.success(
                      t("checkout.step1.addressSelector.deliveryAvailable", {
                        distance: "?",
                      }) || "Delivery available!",
                      {
                        duration: 3000,
                      }
                    );
                  }
                  isProcessingRef.current = false;
                } else if (components.latitude && components.longitude) {
                  // Address not from filtered list, check delivery availability via API
                  branchService.checkDeliveryAvailability(
                    components.latitude,
                    components.longitude
                  )
                    .then((result) => {
                      if (result && result.available && result.branch) {
                        setAvailability({
                          available: true,
                          branch: {
                            id: result.branch.id,
                            name: result.branch.name,
                            distanceKm: result.distance ?? null,
                          },
                        });
                        toast.success(
                          t("checkout.step1.addressSelector.deliveryAvailable", {
                            distance: result.distance?.toFixed(1) || "?",
                          }) || `Delivery available! Distance: ${result.distance?.toFixed(1) || "?"} km`,
                          {
                            duration: 3000,
                          }
                        );
                  } else if (result) {
                    const errorMessage = result.message || 
                      t("checkout.step1.addressSelector.deliveryNotAvailable") ||
                      "We don't have delivery at that area at the moment";
                    setAvailability({
                      available: false,
                      message: errorMessage,
                    });
                    toast.error(errorMessage, {
                      duration: 5000,
                      style: {
                        background: "rgba(239, 68, 68, 0.9)",
                        color: "#ffffff",
                        border: "1px solid rgba(239, 68, 68, 0.5)",
                        borderRadius: "12px",
                        boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
                      },
                    });
                  } else {
                    // result is undefined - API call failed
                    setAvailability({
                      available: false,
                      message: t("checkout.step1.addressSelector.deliveryNotAvailable") ||
                        "We don't have delivery at that area at the moment",
                    });
                  }
                      isProcessingRef.current = false;
                    })
                    .catch((error) => {
                      console.error("Delivery availability check failed", error);
                      const errorMessage = t("checkout.step1.addressGeocodingFailed") ||
                        "Failed to check delivery availability. Please try again.";
                      setAvailability({
                        available: false,
                        message: errorMessage,
                      });
                      toast.error(errorMessage, {
                        duration: 5000,
                        style: {
                          background: "rgba(239, 68, 68, 0.9)",
                          color: "#ffffff",
                          border: "1px solid rgba(239, 68, 68, 0.5)",
                          borderRadius: "12px",
                          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
                        },
                      });
                      isProcessingRef.current = false;
                    });
                } else {
                  isProcessingRef.current = false;
                }
              } else {
                // Place details API call failed
                // If from filtered list, we still trust it's within range
                if (isFromFilteredList) {
                  setAvailability({
                    available: true,
                    branch: {
                      id: branchSummary?.id || fullBranch?.id || "",
                      name: branchSummary?.name || fullBranch?.name || "",
                      distanceKm: null,
                    },
                  });
                  toast.success(
                    t("checkout.step1.addressSelector.deliveryAvailable", {
                      distance: "?",
                    }) || "Delivery available!",
                    {
                      duration: 3000,
                    }
                  );
                  isProcessingRef.current = false;
                } else {
                  // Not from filtered list, try fallback geocoding
                  calculateAddressDistance(address).finally(() => {
                    isProcessingRef.current = false;
                  });
                }
              }
            }
          );
        } else {
          // No matching prediction found
          // If from filtered list, we still trust it's within range
          if (isFromFilteredList) {
            setAvailability({
              available: true,
              branch: {
                id: branchSummary?.id || fullBranch?.id || "",
                name: branchSummary?.name || fullBranch?.name || "",
                distanceKm: null,
              },
            });
            toast.success(
              t("checkout.step1.addressSelector.deliveryAvailable", {
                distance: "?",
              }) || "Delivery available!",
              {
                duration: 3000,
              }
            );
            isProcessingRef.current = false;
          } else {
            // Fallback: calculate distance with the selected address
            calculateAddressDistance(address).finally(() => {
              isProcessingRef.current = false;
            });
          }
        }
      } else {
        // Fallback if Google not loaded - just calculate distance
        calculateAddressDistance(address).finally(() => {
          isProcessingRef.current = false;
        });
      }
    },
    [
      googleLoaded,
      branchData,
      addressPredictions,
      filteredPredictions,
      branchSummary,
      fullBranch,
      onAddressChange,
      calculateAddressDistance,
      postalCode,
      streetAddress,
      addressType,
      houseNumber,
      building,
      floor,
      apartment,
      setAvailability,
      onDistanceCalculated,
      calculateDistance,
      t,
    ]
  );

  // Don't calculate distance while typing - only calculate on blur
  // This prevents constant geocoding errors while user is still typing

  const handleGetCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error(t("checkout.step1.addressSelector.geolocationNotSupported"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      return;
    }

    if (!googleLoaded) {
      toast.error(t("checkout.step1.addressSelector.googleMapsNotLoaded"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      return;
    }

    setGettingLocation(true);
    
    // Step 1: Get GPS coordinates
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Step 2: Use Google reverse geocoding to convert coordinates to address
        googlePlacesService.reverseGeocode(
          lat,
          lng,
      (components) => {
        setGettingLocation(false);
            
            // Use formatted address from reverse geocoding (most meaningful)
        let fullAddress = components.formattedAddress || "";

            // If formatted address is not available, construct from components
            if (!fullAddress) {
          const parts: string[] = [];
          if (components.addressLineOne) parts.push(components.addressLineOne);
          if (components.city) parts.push(components.city);
          if (components.state) parts.push(components.state);
          if (components.country) parts.push(components.country);
          fullAddress = parts.join(", ");
        }

        if (fullAddress) {
          setAddressLineOne(fullAddress);

          const inferredPostal = components.zipCode;
          if (inferredPostal) {
            setPostalCode(inferredPostal);
          }

          const split = splitStreetAndHouse(components.addressLineOne);
          const inferredStreet = split.street;
          const inferredHouseNo = split.house;

          if (inferredStreet) {
            setStreetAddress(inferredStreet);
          }
          if (inferredHouseNo) {
            setHouseNumber(inferredHouseNo);
          }

          onAddressChange({
            fullAddress: fullAddress,
            streetAddress: inferredStreet || streetAddress || undefined,
            postalCode: inferredPostal || undefined,
            addressType,
            houseNumber:
              addressType === "HOUSE"
                ? inferredHouseNo || houseNumber || undefined
                : undefined,
            building: building || undefined,
            floor: floor || undefined,
            apartment: apartment || undefined,
                extraDetails: extraDetails || undefined,
          });
              
              // Calculate distance using branch data
          if (
            components.latitude &&
            components.longitude &&
                onDistanceCalculated &&
                branchData.latitude !== undefined &&
                branchData.longitude !== undefined
          ) {
                const restaurantLat = typeof branchData.latitude === "string"
                  ? parseFloat(branchData.latitude)
                  : branchData.latitude;
                const restaurantLon = typeof branchData.longitude === "string"
                  ? parseFloat(branchData.longitude)
                  : branchData.longitude;

            if (
              !isNaN(restaurantLat) &&
              !isNaN(restaurantLon) &&
              typeof components.latitude === "number" &&
              typeof components.longitude === "number"
            ) {
              const distance = calculateDistance(
                    restaurantLat,
                    restaurantLon,
                components.latitude,
                components.longitude
              );
              onDistanceCalculated(distance);
            }
          }
              
              toast.success(t("checkout.step1.addressSelector.addressRetrieved"), {
                duration: 3000,
                style: {
                  background: "rgba(34, 197, 94, 0.9)",
                  color: "#ffffff",
                  border: "1px solid rgba(34, 197, 94, 0.5)",
                  borderRadius: "12px",
                  boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
                },
              });
        } else {
              setGettingLocation(false);
          toast.error(
            t("checkout.step1.addressSelector.couldNotRetrieveAddress"),
            {
              duration: 4000,
              style: {
                background: "rgba(239, 68, 68, 0.9)",
                color: "#ffffff",
                border: "1px solid rgba(239, 68, 68, 0.5)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
              },
            }
          );
        }
      },
      (error) => {
        setGettingLocation(false);
        toast.error(
              t("checkout.step1.addressSelector.failedToGeocode", { error }),
              {
                duration: 4000,
                style: {
                  background: "rgba(239, 68, 68, 0.9)",
                  color: "#ffffff",
                  border: "1px solid rgba(239, 68, 68, 0.5)",
                  borderRadius: "12px",
                  boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
                },
              }
            );
          }
        );
      },
      (error) => {
        setGettingLocation(false);
        toast.error(
          t("checkout.step1.addressSelector.failedToGetLocation", { error: error.message }),
          {
            duration: 4000,
            style: {
              background: "rgba(239, 68, 68, 0.9)",
              color: "#ffffff",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
            },
          }
        );
      }
    );
  }, [
    googleLoaded,
    branchData,
    onAddressChange,
    onDistanceCalculated,
    postalCode,
    streetAddress,
    addressType,
    houseNumber,
    building,
    floor,
    apartment,
    t,
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon path={mdiMapMarker} size={0.83} className="text-pink-500" />
          {t("checkout.step1.addressSelector.title")}{" "}
          <span className="text-red-500">*</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            country-provice/state-city
          </div>
          <div className="text-sm font-medium">
            {(branchData.country || t("checkout.step1.addressSelector.notSet")) +
              "-" +
              (branchData.state || t("checkout.step1.addressSelector.notSet")) +
              "-" +
              (branchData.city || t("checkout.step1.addressSelector.notSet"))}
          </div>
        </div>

      {/* Full Address - Editable with autocomplete */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="fullAddress">
            {t("checkout.step1.addressSelector.fullAddress")}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGetCurrentLocation}
            disabled={
              !googleLoaded ||
              gettingLocation ||
              !branchData.city ||
              !branchData.country
            }
            className="flex items-center gap-2 bg-transparent hover:bg-transparent"
          >
            {gettingLocation ? (
              <>
                <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                {t("checkout.step1.addressSelector.gettingLocation")}
              </>
            ) : (
              <>
                <Icon path={mdiNavigation} size={0.67} />
                {t("checkout.step1.addressSelector.useGPS")}
              </>
            )}
          </Button>
        </div>
        <div className="relative">
          <Input
            id="fullAddress"
            value={addressLineOne}
            onChange={(e) => handleAddressInputChange(e.target.value)}
            onFocus={() => {
              if (
                addressLineOne &&
                addressLineOne.length >= 1 &&
                addressSuggestions.length > 0
              ) {
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
              className="pr-8"
              disabled={
                !branchData.city ||
                !branchData.country ||
                !googleLoaded ||
                !branchData.latitude ||
                !branchData.longitude
              }
            />
            {addressLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Icon path={mdiLoading} size={0.67} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {filteringSuggestions && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Icon path={mdiLoading} size={0.67} className="animate-spin text-blue-500" />
              </div>
            )}
            {showAddressSuggestions && addressSuggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                {addressSuggestions.length === 0 && filteringSuggestions && (
                  <div className="px-4 py-2 text-sm text-muted-foreground text-center">
                    {t("checkout.step1.addressSelector.filteringAddresses") || "Filtering addresses within delivery range..."}
                  </div>
                )}
                {addressSuggestions.map((address, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleAddressSelect(address)}
                    className="w-full text-left px-4 py-2 hover:bg-muted text-foreground text-sm first:rounded-t-lg last:rounded-b-lg transition-colors"
                  >
                    {address}
                  </button>
                ))}
                {addressSuggestions.length === 0 && !filteringSuggestions && (
                  <div className="px-4 py-2 text-sm text-muted-foreground text-center">
                    {t("checkout.step1.addressSelector.noAddressesInRange") || "No addresses found within delivery range"}
              </div>
            )}
          </div>
            )}
          </div>
          {(!branchData.city || !branchData.country) && (
            <p className="text-xs text-muted-foreground">
              {t("checkout.step1.addressSelector.restaurantLocationRequired")}
            </p>
          )}
          {(!branchData.latitude || !branchData.longitude) && (
            <p className="text-xs text-muted-foreground">
              {t("checkout.step1.addressSelector.coordinatesRequired")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="space-y-2">
            <Label htmlFor="postalCode">
              {t("checkout.step1.addressSelector.postalCode") || "Postal Code"}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="postalCode"
              value={postalCode}
              onChange={(e) => {
                const newValue = e.target.value;
                setPostalCode(newValue);
                onAddressChange({
                  fullAddress: addressLineOne,
                  streetAddress: streetAddress || undefined,
                  postalCode: newValue || undefined,
                  addressType,
                  houseNumber: houseNumber || undefined,
                  building: building || undefined,
                  floor: floor || undefined,
                  apartment: apartment || undefined,
                  extraDetails: extraDetails || undefined,
                });
              }}
              onBlur={() => {
                validateStreetAddress();
              }}
            />
            </div>

            <div className="space-y-2">
              <Label htmlFor="streetAddress">
                {t("checkout.step1.addressSelector.streetAddress") || "Street Address"}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="streetAddress"
                value={streetAddress}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setStreetAddress(newValue);
                  if (streetAddressError) setStreetAddressError("");
                  onAddressChange({
                    fullAddress: addressLineOne,
                    streetAddress: newValue || undefined,
                    postalCode: postalCode || undefined,
                    addressType,
                    houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
                    building: addressType === "BUILDING" ? building || undefined : undefined,
                    floor: addressType === "BUILDING" ? floor || undefined : undefined,
                    apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }}
                onBlur={() => {
                  validateStreetAddress();
                }}
                placeholder={
                  t("checkout.step1.addressSelector.streetAddressPlaceholder") ||
                  "e.g., Musterstraße 12"
                }
              />
              {streetAddressError && (
                <p className="text-xs text-red-500">{streetAddressError}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              {t("checkout.step1.addressSelector.addressType") || "Address Type"}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <RadioGroup
              value={addressType}
              onValueChange={(value) => {
                const next = value === "BUILDING" ? "BUILDING" : "HOUSE";
                setAddressType(next);

                if (next === "HOUSE") {
                  setBuilding("");
                  setFloor("");
                  setApartment("");
                } else {
                  setHouseNumber("");
                }

                onAddressChange({
                  fullAddress: addressLineOne,
                  streetAddress: streetAddress || undefined,
                  postalCode: postalCode || undefined,
                  addressType: next,
                  houseNumber: next === "HOUSE" ? houseNumber || undefined : undefined,
                  building: next === "BUILDING" ? building || undefined : undefined,
                  floor: next === "BUILDING" ? floor || undefined : undefined,
                  apartment: next === "BUILDING" ? apartment || undefined : undefined,
                  extraDetails: extraDetails || undefined,
                });
              }}
              className="flex items-center gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="HOUSE" id="addressTypeHouse" />
                <Label htmlFor="addressTypeHouse">
                  {t("checkout.step1.addressSelector.house") || "House"}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="BUILDING" id="addressTypeBuilding" />
                <Label htmlFor="addressTypeBuilding">
                  {t("checkout.step1.addressSelector.building") || "Building"}
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {addressType === "HOUSE" && (
          <div className="space-y-2">
            <Label htmlFor="houseNumber">
              {t("checkout.step1.addressSelector.houseNumber") || "House Number"}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="houseNumber"
              value={houseNumber}
              onChange={(e) => {
                const newValue = e.target.value;
                setHouseNumber(newValue);
                onAddressChange({
                  fullAddress: addressLineOne,
                  streetAddress: streetAddress || undefined,
                  postalCode: postalCode || undefined,
                  addressType,
                  houseNumber: newValue || undefined,
                  building: undefined,
                  floor: undefined,
                  apartment: undefined,
                  extraDetails: extraDetails || undefined,
                });
              }}
            />
          </div>
        )}

        {addressType === "BUILDING" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="building">
                {t("checkout.step1.addressSelector.buildingName")}<span className="text-red-500">*</span>
              </Label>
              <Input
                id="building"
                value={building}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setBuilding(newValue);
                  onAddressChange({
                    fullAddress: addressLineOne,
                    streetAddress: streetAddress || undefined,
                    postalCode: postalCode || undefined,
                    addressType,
                    building: newValue || undefined,
                    floor: floor || undefined,
                    apartment: apartment || undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }}
                placeholder={t(
                  "checkout.step1.addressSelector.buildingPlaceholder"
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor">
                {t("checkout.step1.addressSelector.floor")}<span className="text-red-500">*</span>
              </Label>
              <Input
                id="floor"
                value={floor}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setFloor(newValue);
                  onAddressChange({
                    fullAddress: addressLineOne,
                    streetAddress: streetAddress || undefined,
                    postalCode: postalCode || undefined,
                    addressType,
                    building: building || undefined,
                    floor: newValue || undefined,
                    apartment: apartment || undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }}
                placeholder={t("checkout.step1.addressSelector.floorPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apartment">
                {t("checkout.step1.addressSelector.apartmentUnit")}<span className="text-red-500">*</span>
              </Label>
              <Input
                id="apartment"
                value={apartment}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setApartment(newValue);
                  onAddressChange({
                    fullAddress: addressLineOne,
                    streetAddress: streetAddress || undefined,
                    postalCode: postalCode || undefined,
                    addressType,
                    building: building || undefined,
                    floor: floor || undefined,
                    apartment: newValue || undefined,
                    extraDetails: extraDetails || undefined,
                  });
                }}
                placeholder={t(
                  "checkout.step1.addressSelector.apartmentPlaceholder"
                )}
              />
            </div>
          </div>
        )}

        {/* Extra Address Details */}
        <div className="space-y-2">
          <Label htmlFor="extraDetails">
            {t("checkout.step1.addressSelector.extraDetails")} (Optional)
          </Label>
          <Input
            id="extraDetails"
            value={extraDetails}
            onChange={(e) => {
              const newValue = e.target.value;
              setExtraDetails(newValue);
              onAddressChange({
                fullAddress: addressLineOne,
                streetAddress: streetAddress || undefined,
                postalCode: postalCode || undefined,
                addressType,
                houseNumber: addressType === "HOUSE" ? houseNumber || undefined : undefined,
                building: addressType === "BUILDING" ? building || undefined : undefined,
                floor: addressType === "BUILDING" ? floor || undefined : undefined,
                apartment: addressType === "BUILDING" ? apartment || undefined : undefined,
                extraDetails: newValue || undefined,
              });
            }}
            placeholder={t("checkout.step1.addressSelector.extraDetailsPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("checkout.step1.addressSelector.extraDetailsHint")}
          </p>
        </div>

        {/* Info message */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-800 dark:text-blue-200">
            <span className="font-medium">
              {t("checkout.step1.addressSelector.note")}:
            </span>{" "}
            {t("checkout.step1.addressSelector.addressInfoMessage", {
              city: branchData.city,
              radius: branchData.deliveryRadius,
            })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnhancedAddressSelector;
