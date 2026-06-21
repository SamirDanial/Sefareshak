import { Alert } from "react-native";
import Constants from "expo-constants";
import { calculateDistance } from "../utils/distanceCalculator";

// Get API key from Expo constants (works for both .env and app.json)
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

export interface AddressComponents {
  country: string;
  state: string;
  city: string;
  addressLineOne: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
  zipCode?: string;
}

type OnAddressChangeCallback = (components: AddressComponents) => void;

class GooglePlacesService {
  private static instance: GooglePlacesService;

  private constructor() {}

  static getInstance(): GooglePlacesService {
    if (!GooglePlacesService.instance) {
      GooglePlacesService.instance = new GooglePlacesService();
    }
    return GooglePlacesService.instance;
  }

  /**
   * Check if API key is available
   */
  isApiKeyAvailable(): boolean {
    const hasKey = !!API_KEY;
    if (!hasKey) {
      console.warn(
        "Google Places API key not found. Check EXPO_PUBLIC_GOOGLE_PLACES_API_KEY in .env or app.json"
      );
    }
    return hasKey;
  }

  async getCountryCodeFromName(countryName: string): Promise<string | null> {
    if (!API_KEY) return null;
    const trimmed = String(countryName || "").trim();
    if (!trimmed) return null;

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        trimmed
      )}&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.results?.length) {
        const countryResult = data.results.find((result: any) => result.types?.includes("country"));
        const comps = (countryResult || data.results[0])?.address_components || [];
        const countryComp = comps.find((c: any) => (c.types || []).includes("country"));
        const cc = String(countryComp?.short_name || "").trim();
        return cc ? cc.toLowerCase() : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  async geocodeZipCode(
    zip: string,
    countryCode?: string | null
  ): Promise<{ latitude: number; longitude: number; label: string; postalCode: string } | null> {
    if (!API_KEY) return null;
    const trimmed = String(zip || "").trim();
    if (!trimmed) return null;

    const normalizeZip = (z: string) => {
      const raw = String(z || "").trim().toUpperCase();
      return raw.replace(/[^0-9A-Z]/g, "");
    };

    const inputZip = normalizeZip(trimmed);
    const countryUpper = countryCode ? String(countryCode).trim().toUpperCase() : null;

    const getPostalFromResult = (r: any) => {
      const comps = r?.address_components || [];
      const postalComp = comps.find((c: any) => {
        const types = c?.types || [];
        return types.includes("postal_code") || types.includes("postal_code_prefix");
      });
      return String(postalComp?.long_name || postalComp?.short_name || "").trim();
    };

    const hasPostalCode = (r: any) => {
      const comps = r?.address_components || [];
      return comps.some((c: any) => {
        const types = c?.types || [];
        return types.includes("postal_code") || types.includes("postal_code_prefix");
      });
    };

    const getCountryFromResult = (r: any) => {
      const comps = r?.address_components || [];
      const country = comps.find((c: any) => {
        const types = c?.types || [];
        return types.includes("country");
      });
      return String(country?.short_name || country?.long_name || "").trim();
    };

    const chooseResult = (results: any[]) => {
      let chosen = results.find((r: any) => {
        const found = normalizeZip(getPostalFromResult(r));
        if (!found) return false;
        return found === inputZip || found.startsWith(inputZip) || inputZip.startsWith(found);
      });

      if (!chosen) {
        chosen = results.find((r: any) => hasPostalCode(r)) ?? null;
      }

      if (!chosen && countryUpper) {
        chosen =
          results.find((r: any) => {
            const cc = String(getCountryFromResult(r) || "").toUpperCase();
            return Boolean(cc) && cc === countryUpper;
          }) ?? null;
      }

      return chosen;
    };

    const fetchGeocode = async (url: string) => {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== "OK" || !data.results || data.results.length === 0) return null;
      return data.results as any[];
    };

    try {
      if (countryUpper) {
        const componentUrl = `https://maps.googleapis.com/maps/api/geocode/json?components=${encodeURIComponent(
          `country:${countryUpper}|postal_code:${trimmed}`
        )}&key=${API_KEY}`;

        const componentResults = await fetchGeocode(componentUrl);
        if (componentResults && componentResults.length > 0) {
          const chosen = chooseResult(componentResults);
          if (chosen?.geometry?.location) {
            const lat = Number(chosen.geometry.location.lat);
            const lon = Number(chosen.geometry.location.lng);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              const postalCode = String(getPostalFromResult(chosen) || trimmed).trim();
              const label = postalCode ? `ZIP ${postalCode}` : String(chosen.formatted_address || trimmed);
              return { latitude: lat, longitude: lon, label, postalCode };
            }
          }
        }

        const addressUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          trimmed
        )}&components=${encodeURIComponent(`country:${countryUpper}`)}&region=${encodeURIComponent(
          countryUpper
        )}&key=${API_KEY}`;

        const addressResults = await fetchGeocode(addressUrl);
        if (addressResults && addressResults.length > 0) {
          const chosen = chooseResult(addressResults) ?? addressResults[0];
          const lat = Number(chosen?.geometry?.location?.lat);
          const lon = Number(chosen?.geometry?.location?.lng);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            const postalCode = String(getPostalFromResult(chosen) || trimmed).trim();
            const label = postalCode ? `ZIP ${postalCode}` : String(chosen?.formatted_address || trimmed);
            return { latitude: lat, longitude: lon, label, postalCode };
          }
        }

        return null;
      }

      const fallbackUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        trimmed
      )}&key=${API_KEY}`;

      const results = await fetchGeocode(fallbackUrl);
      if (!results || results.length === 0) return null;

      const chosen = chooseResult(results) ?? results[0];
      const lat = Number(chosen?.geometry?.location?.lat);
      const lon = Number(chosen?.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const postalCode = String(getPostalFromResult(chosen) || trimmed).trim();
      const label = postalCode ? `ZIP ${postalCode}` : String(chosen?.formatted_address || trimmed);
      return { latitude: lat, longitude: lon, label, postalCode };
    } catch {
      return null;
    }
  }

  /**
   * Search for street addresses using Google Places API
   * Returns prediction objects with place_id for better address handling
   */
  async searchAddresses(
    addressInput: string,
    countryName: string,
    cityName: string,
    stateName?: string,
    restaurantLat?: number,
    restaurantLon?: number,
    deliveryRadius?: number
  ): Promise<Array<{ description: string; place_id: string }>> {
    if (!API_KEY) {
      console.error("Google Places API key not found");
      return [];
    }

    if (!addressInput || addressInput.length < 1 || !countryName) {
      return [];
    }

    try {
      // Get country code first
      let countryCode: string | null = null;
      try {
        const countryGeocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          countryName
        )}&key=${API_KEY}`;

        const countryResponse = await fetch(countryGeocodeUrl);
        const countryData = await countryResponse.json();

        if (countryData.status === "OK" && countryData.results?.length) {
          const countryResult = countryData.results.find((result: any) =>
            result.types.includes("country")
          );
          if (countryResult) {
            const countryComponent = countryResult.address_components.find(
              (component: any) => component.types.includes("country")
            );
            countryCode = countryComponent?.short_name?.toLowerCase() || null;
          }
        }
      } catch (err) {
        console.warn("Failed to get country code:", err);
      }

      // Use Places Autocomplete API with location biasing (not strict filtering)
      // Don't restrict types - let Google return all types (addresses, establishments, landmarks, etc.)
      let autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        addressInput
      )}&key=${API_KEY}`;

      if (countryCode) {
        autocompleteUrl += `&components=country:${countryCode}`;
      }

      // Add location biasing if restaurant coordinates are available
      // Use biasing (not strict filtering) to show more results like Google Maps
      if (
        restaurantLat !== undefined &&
        restaurantLon !== undefined &&
        !isNaN(restaurantLat) &&
        !isNaN(restaurantLon) &&
        isFinite(restaurantLat) &&
        isFinite(restaurantLon)
      ) {
        // Use location and radius for biasing (not strict filtering)
        // This biases results towards the branch location but doesn't exclude results outside
        autocompleteUrl += `&location=${restaurantLat},${restaurantLon}`;
        // Use a larger radius for biasing to show more results (like Google Maps does)
        // This is just for biasing, not filtering
        autocompleteUrl += `&radius=50000`; // 50km radius for biasing (much larger than delivery radius)
      }

      const autocompleteResponse = await fetch(autocompleteUrl);
      const autocompleteData = await autocompleteResponse.json();

      // Log API errors for debugging
      if (autocompleteData.status !== "OK") {
        if (autocompleteData.status === "REQUEST_DENIED") {
          console.error("API key may be invalid or not enabled for Places API");
        }
        return [];
      }

      if (!autocompleteData.predictions?.length) {
        return [];
      }

      // Return prediction objects with place_id (filtering will be done separately)
      const predictions: Array<{ description: string; place_id: string }> = [];
      for (const prediction of autocompleteData.predictions.slice(0, 10)) {
        if (prediction.description && prediction.description.length > 0 && prediction.place_id) {
          predictions.push({
            description: prediction.description,
            place_id: prediction.place_id,
          });
        }
      }

      return predictions;
    } catch (error) {
      console.error("Error searching addresses:", error);
      return [];
    }
  }

  /**
   * Reverse geocode coordinates to get address details
   */
  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<AddressComponents | null> {
    if (!API_KEY) {
      console.error("Google Places API key not found");
      return null;
    }

    // Validate coordinates
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      isNaN(latitude) ||
      isNaN(longitude) ||
      !isFinite(latitude) ||
      !isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      // Silently return null for invalid coordinates (expected behavior)
      return null;
    }

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}`;

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(geocodeUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Geocoding API responded with status: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.status === "OK" && data.results?.[0]) {
        return this.extractAddressComponents(data.results[0]);
      } else if (data.status === "ZERO_RESULTS") {
        // No results found - this is normal, return null
        return null;
      } else if (data.status === "REQUEST_DENIED") {
        console.error("Geocoding API request denied - check API key and restrictions");
        return null;
      } else if (data.status === "OVER_QUERY_LIMIT") {
        console.error("Geocoding API query limit exceeded");
        return null;
      } else {
        console.error(`Geocoding API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
        return null;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error("Geocoding request timed out");
      } else if (error.message === 'Network request failed') {
        console.error("Geocoding network request failed - check internet connection");
      } else {
        console.error("Error reverse geocoding:", error);
      }
      return null;
    }
  }

  /**
   * Get current location using GPS and reverse geocode it
   * For React Native, use expo-location instead of navigator.geolocation
   */
  async getCurrentLocation(
    onSuccess: OnAddressChangeCallback,
    onError?: (error: string) => void
  ): Promise<void> {
    try {
      // Dynamic import for expo-location
      const { getCurrentPositionAsync, requestForegroundPermissionsAsync } =
        await import("expo-location");

      // Request permissions
      const { status } = await requestForegroundPermissionsAsync();
      if (status !== "granted") {
        const errorMsg = "Location permission denied";
        Alert.alert("Error", errorMsg);
        if (onError) onError(errorMsg);
        return;
      }

      // Get current position
      const location = await getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;

      const components = await this.reverseGeocode(lat, lng);
      if (components) {
        onSuccess(components);
      } else {
        // At least return coordinates
        onSuccess({
          country: "",
          state: "",
          city: "",
          addressLineOne: "",
          latitude: lat,
          longitude: lng,
          formattedAddress: "",
          zipCode: undefined,
        });
      }
    } catch (error: any) {
      const errorMsg =
        "Failed to get location: " + (error.message || String(error));
      Alert.alert("Error", errorMsg);
      if (onError) onError(errorMsg);
    }
  }

  /**
   * Search for countries using Google Places API
   */
  async searchCountries(input: string): Promise<string[]> {
    if (!API_KEY || !input || input.length < 2) {
      return [];
    }

    try {
      const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&types=(regions)&key=${API_KEY}`;

      const response = await fetch(autocompleteUrl);
      const data = await response.json();

      if (data.status !== "OK" || !data.predictions) {
        return [];
      }

      const countries = new Set<string>();
      for (const prediction of data.predictions.slice(0, 10)) {
        // Check if it's a country type
        if (prediction.types?.includes("country")) {
          // Get place details to extract country name
          try {
            const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=address_components,name&key=${API_KEY}`;
            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();

            if (detailsData.status === "OK" && detailsData.result) {
              const components = detailsData.result.address_components || [];
              const countryComponent = components.find((c: any) =>
                c.types.includes("country")
              );
              if (countryComponent) {
                countries.add(countryComponent.long_name);
              } else if (detailsData.result.name) {
                countries.add(detailsData.result.name);
              }
            }
          } catch (err) {
            // If details lookup fails, use prediction description
            if (prediction.description) {
              countries.add(prediction.description);
            }
          }
        }
      }

      return Array.from(countries).sort().slice(0, 10);
    } catch (error) {
      console.error("Error searching countries:", error);
      return [];
    }
  }

  /**
   * Search for states/provinces in a country
   */
  async searchStates(input: string, countryName: string): Promise<string[]> {
    if (!API_KEY || !input || !countryName || input.length < 1) {
      return [];
    }

    try {
      // Get country code first
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        countryName
      )}&key=${API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      let countryCode: string | null = null;
      if (geocodeData.status === "OK" && geocodeData.results?.length) {
        const countryResult = geocodeData.results.find((result: any) =>
          result.types.includes("country")
        );
        if (countryResult) {
          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          countryCode = countryComponent?.short_name?.toLowerCase() || null;
        }
      }

      if (!countryCode) {
        return [];
      }

      const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&types=(regions)&components=country:${countryCode}&key=${API_KEY}`;

      const response = await fetch(autocompleteUrl);
      const data = await response.json();

      if (data.status !== "OK" || !data.predictions) {
        return [];
      }

      const states = new Set<string>();
      for (const prediction of data.predictions.slice(0, 10)) {
        // Check if it's an administrative_area_level_1 (state/province)
        if (prediction.types?.includes("administrative_area_level_1")) {
          // Get place details
          try {
            const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=address_components,name&key=${API_KEY}`;
            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();

            if (detailsData.status === "OK" && detailsData.result) {
              const components = detailsData.result.address_components || [];
              const stateComponent = components.find((c: any) =>
                c.types.includes("administrative_area_level_1")
              );
              if (stateComponent) {
                states.add(stateComponent.long_name);
              } else if (detailsData.result.name) {
                states.add(detailsData.result.name);
              }
            }
          } catch (err) {
            if (prediction.description) {
              states.add(prediction.description);
            }
          }
        }
      }

      return Array.from(states).sort().slice(0, 10);
    } catch (error) {
      console.error("Error searching states:", error);
      return [];
    }
  }

  /**
   * Search for cities in a country/state
   */
  async searchCities(
    input: string,
    countryName: string,
    stateName?: string
  ): Promise<string[]> {
    if (!API_KEY || !input || !countryName || input.length < 1) {
      return [];
    }

    try {
      // Get country code
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        countryName
      )}&key=${API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      let countryCode: string | null = null;
      if (geocodeData.status === "OK" && geocodeData.results?.length) {
        const countryResult = geocodeData.results.find((result: any) =>
          result.types.includes("country")
        );
        if (countryResult) {
          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          countryCode = countryComponent?.short_name?.toLowerCase() || null;
        }
      }

      if (!countryCode) {
        return [];
      }

      let autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&types=(cities)&components=country:${countryCode}&key=${API_KEY}`;

      const response = await fetch(autocompleteUrl);
      const data = await response.json();

      if (data.status !== "OK" || !data.predictions) {
        return [];
      }

      const cities = new Set<string>();
      for (const prediction of data.predictions.slice(0, 10)) {
        if (
          prediction.types?.includes("locality") ||
          prediction.types?.includes("administrative_area_level_2")
        ) {
          // Filter by state if provided
          if (stateName) {
            // Get place details to check state
            try {
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=address_components,name&key=${API_KEY}`;
              const detailsResponse = await fetch(detailsUrl);
              const detailsData = await detailsResponse.json();

              if (detailsData.status === "OK" && detailsData.result) {
                const components = detailsData.result.address_components || [];
                const stateComponent = components.find((c: any) =>
                  c.types.includes("administrative_area_level_1")
                );
                if (stateComponent && stateComponent.long_name === stateName) {
                  cities.add(detailsData.result.name || prediction.description);
                }
              }
            } catch (err) {
              // If check fails, include anyway
              cities.add(prediction.description);
            }
          } else {
            cities.add(prediction.description);
          }
        }
      }

      return Array.from(cities).sort().slice(0, 10);
    } catch (error) {
      console.error("Error searching cities:", error);
      return [];
    }
  }

  /**
   * Check if a country has states/provinces
   */
  async checkCountryHasStates(countryName: string): Promise<boolean> {
    if (!API_KEY || !countryName) {
      return true; // Default to showing state field
    }

    try {
      // Get country code
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        countryName
      )}&key=${API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      let countryCode: string | null = null;
      if (geocodeData.status === "OK" && geocodeData.results?.length) {
        const countryResult = geocodeData.results.find((result: any) =>
          result.types.includes("country")
        );
        if (countryResult) {
          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          countryCode = countryComponent?.short_name?.toLowerCase() || null;
        }
      }

      if (!countryCode) {
        return true; // Default to showing state field
      }

      // Search for a city in this country to check for states
      const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        countryName
      )}&types=(cities)&components=country:${countryCode}&key=${API_KEY}`;

      const response = await fetch(autocompleteUrl);
      const data = await response.json();

      if (data.status === "OK" && data.predictions?.length > 0) {
        // Get details of first city
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${data.predictions[0].place_id}&fields=address_components&key=${API_KEY}`;
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();

        if (
          detailsData.status === "OK" &&
          detailsData.result?.address_components
        ) {
          const hasState = detailsData.result.address_components.some(
            (component: any) =>
              component.types.includes("administrative_area_level_1")
          );
          return hasState;
        }
      }

      return true; // Default to showing state field
    } catch (error) {
      console.error("Error checking country states:", error);
      return true; // Default to showing state field
    }
  }

  /**
   * Extract address components from Google Place result
   */
  extractAddressComponents(place: any): AddressComponents {
    const addressComponents = place.address_components || [];
    let country = "";
    let state = "";
    let city = "";
    let addressLineOne = "";
    let zipCode = "";

    for (let i = 0; i < addressComponents.length; i++) {
      const component = addressComponents[i];
      const types = component.types;
      if (types.includes("country")) {
        country = component.long_name;
      } else if (types.includes("administrative_area_level_1")) {
        state = component.long_name;
      } else if (
        types.includes("locality") ||
        types.includes("administrative_area_level_2")
      ) {
        if (!city) city = component.long_name;
      } else if (types.includes("street_number") || types.includes("route")) {
        if (types.includes("street_number")) {
          addressLineOne = component.long_name;
        } else if (types.includes("route")) {
          addressLineOne = addressLineOne
            ? `${addressLineOne} ${component.long_name}`
            : component.long_name;
        }
      } else if (types.includes("postal_code")) {
        zipCode = component.long_name;
      }
    }

    // If addressLineOne is still empty, use formatted_address
    if (!addressLineOne && place.formatted_address) {
      addressLineOne = place.formatted_address;
    }

    const lat = place.geometry?.location?.lat || 0;
    const lng = place.geometry?.location?.lng || 0;

    return {
      country,
      state,
      city,
      addressLineOne,
      latitude: typeof lat === "function" ? lat() : lat,
      longitude: typeof lng === "function" ? lng() : lng,
      formattedAddress: place.formatted_address || "",
      zipCode: zipCode || undefined,
    };
  }

  /**
   * Get place details by place_id
   */
  async getPlaceDetails(placeId: string): Promise<{
    latitude: number;
    longitude: number;
    formattedAddress: string;
    addressLineOne?: string;
    zipCode?: string;
  } | null> {
    if (!API_KEY || !placeId) {
      return null;
    }

    try {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,address_components&key=${API_KEY}`;
      const response = await fetch(detailsUrl);
      const data = await response.json();

      if (data.status === "OK" && data.result?.geometry?.location) {
        const location = data.result.geometry.location;
        const extracted = data.result?.address_components
          ? this.extractAddressComponents(data.result)
          : null;
        return {
          latitude: typeof location.lat === "function" ? location.lat() : location.lat,
          longitude: typeof location.lng === "function" ? location.lng() : location.lng,
          formattedAddress: data.result.formatted_address,
          addressLineOne: extracted?.addressLineOne,
          zipCode: extracted?.zipCode,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting place details:", error);
      return null;
    }
  }

  async autocompleteAddress(input: string): Promise<Array<{ description: string; place_id: string }>> {
    if (!API_KEY) return [];
    const q = String(input || "").trim();
    if (q.length < 1) return [];

    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        q
      )}&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== "OK" || !data.predictions?.length) return [];
      const out: { description: string; place_id: string }[] = [];
      for (const p of data.predictions.slice(0, 10)) {
        const description = String(p?.description || "").trim();
        const place_id = String(p?.place_id || "").trim();
        if (!description || !place_id) continue;
        out.push({ description, place_id });
      }
      return out;
    } catch (error) {
      console.error("Error autocompleting address:", error);
      return [];
    }
  }

  async getPlaceLatLng(placeId: string): Promise<{ latitude: number; longitude: number } | null> {
    const trimmed = String(placeId || "").trim();
    if (!trimmed) return null;
    const details = await this.getPlaceDetails(trimmed);
    if (!details) return null;
    const lat = Number(details.latitude);
    const lon = Number(details.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { latitude: lat, longitude: lon };
  }

  /**
   * Geocode an address to get coordinates
   */
  async geocodeAddress(address: string): Promise<{
    latitude: number;
    longitude: number;
    addressLineOne?: string;
    zipCode?: string;
  } | null> {
    if (!API_KEY) {
      console.error("Google Places API key not found");
      return null;
    }

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&key=${API_KEY}`;

      const response = await fetch(geocodeUrl);
      const data = await response.json();

      if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
        const result = data.results[0];
        const location = result.geometry.location;
        const extracted = result?.address_components
          ? this.extractAddressComponents(result)
          : null;
        return {
          latitude:
            typeof location.lat === "function" ? location.lat() : location.lat,
          longitude:
            typeof location.lng === "function" ? location.lng() : location.lng,
          addressLineOne: extracted?.addressLineOne,
          zipCode: extracted?.zipCode,
        };
      }

      return null;
    } catch (error) {
      console.error("Error geocoding address:", error);
      return null;
    }
  }
}

export default GooglePlacesService.getInstance();
