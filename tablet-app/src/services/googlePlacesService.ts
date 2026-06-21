import { Alert } from "react-native";
import Constants from "expo-constants";
import { calculateDistance } from "../utils/distanceCalculator";

const API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  (Constants as any)?.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  (Constants as any)?.manifest?.extra?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  "";

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

  isApiKeyAvailable(): boolean {
    const hasKey = !!API_KEY;
    if (!hasKey) {
      console.warn(
        "Google Places API key not found. Check EXPO_PUBLIC_GOOGLE_PLACES_API_KEY in .env"
      );
    }
    return hasKey;
  }

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
            const countryComponent = countryResult.address_components.find((component: any) =>
              component.types.includes("country")
            );
            countryCode = countryComponent?.short_name?.toLowerCase() || null;
          }
        }
      } catch (err) {
        console.warn("Failed to get country code:", err);
      }

      let autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        addressInput
      )}&key=${API_KEY}`;

      if (countryCode) {
        autocompleteUrl += `&components=country:${countryCode}`;
      }

      if (
        restaurantLat !== undefined &&
        restaurantLon !== undefined &&
        !isNaN(restaurantLat) &&
        !isNaN(restaurantLon) &&
        isFinite(restaurantLat) &&
        isFinite(restaurantLon)
      ) {
        autocompleteUrl += `&location=${restaurantLat},${restaurantLon}`;
        autocompleteUrl += `&radius=50000`;
      }

      const autocompleteResponse = await fetch(autocompleteUrl);
      const autocompleteData = await autocompleteResponse.json();

      if (autocompleteData.status !== "OK") {
        if (autocompleteData.status === "REQUEST_DENIED") {
          console.error("API key may be invalid or not enabled for Places API");
        }
        return [];
      }

      if (!autocompleteData.predictions?.length) {
        return [];
      }

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

  async reverseGeocode(latitude: number, longitude: number): Promise<AddressComponents | null> {
    if (!API_KEY) {
      console.error("Google Places API key not found");
      return null;
    }

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
      return null;
    }

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}`;

      const response = await fetch(geocodeUrl);
      const data = await response.json();

      if (data.status === "OK" && data.results?.[0]) {
        return this.extractAddressComponents(data.results[0]);
      }

      return {
        country: "",
        state: "",
        city: "",
        addressLineOne: "",
        latitude,
        longitude,
        formattedAddress: "",
        zipCode: undefined,
      };
    } catch (error) {
      console.error("Error reverse geocoding:", error);
      return null;
    }
  }

  async getCurrentLocation(onSuccess: OnAddressChangeCallback, onError?: (error: string) => void): Promise<void> {
    try {
      const { getCurrentPositionAsync, requestForegroundPermissionsAsync } = await import("expo-location");

      const { status } = await requestForegroundPermissionsAsync();
      if (status !== "granted") {
        const errorMsg = "Location permission denied";
        Alert.alert("Error", errorMsg);
        if (onError) onError(errorMsg);
        return;
      }

      const location = await getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;

      const components = await this.reverseGeocode(lat, lng);
      if (components) {
        onSuccess(components);
      } else {
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
      const errorMsg = "Failed to get location: " + (error.message || String(error));
      Alert.alert("Error", errorMsg);
      if (onError) onError(errorMsg);
    }
  }

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
        if (prediction.types?.includes("country")) {
          try {
            const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=address_components,name&key=${API_KEY}`;
            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();

            if (detailsData.status === "OK" && detailsData.result) {
              const components = detailsData.result.address_components || [];
              const countryComponent = components.find((c: any) => c.types.includes("country"));
              if (countryComponent) {
                countries.add(countryComponent.long_name);
              } else if (detailsData.result.name) {
                countries.add(detailsData.result.name);
              }
            }
          } catch {
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

  async checkCountryHasStates(countryName: string): Promise<boolean> {
    if (!API_KEY || !countryName) return true;

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        countryName
      )}&key=${API_KEY}`;
      const response = await fetch(geocodeUrl);
      const data = await response.json();

      if (data.status !== "OK" || !data.results?.length) return true;

      const countryResult = data.results.find((r: any) => Array.isArray(r?.types) && r.types.includes("country"));
      const components = countryResult?.address_components || data.results[0]?.address_components || [];

      const countryComponent = components.find((c: any) => Array.isArray(c?.types) && c.types.includes("country"));
      const countryCode = countryComponent?.short_name?.toLowerCase?.() || "";

      const noStateCountries = new Set([
        "ae",
        "bh",
        "bn",
        "dj",
        "gm",
        "hk",
        "jm",
        "kw",
        "lb",
        "lu",
        "mo",
        "mt",
        "om",
        "qa",
        "sg",
      ]);

      if (countryCode && noStateCountries.has(countryCode)) return false;

      return true;
    } catch {
      return true;
    }
  }

  async searchStates(input: string, countryName: string): Promise<string[]> {
    if (!API_KEY || !input || !countryName || input.length < 1) {
      return [];
    }

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        countryName
      )}&key=${API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      let countryCode: string | null = null;
      if (geocodeData.status === "OK" && geocodeData.results?.length) {
        const countryResult = geocodeData.results.find((result: any) => result.types.includes("country"));
        if (countryResult) {
          const countryComponent = countryResult.address_components.find((component: any) =>
            component.types.includes("country")
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
        if (prediction.types?.includes("administrative_area_level_1")) {
          try {
            const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=address_components,name&key=${API_KEY}`;
            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();

            if (detailsData.status === "OK" && detailsData.result) {
              const components = detailsData.result.address_components || [];
              const stateComponent = components.find((c: any) => c.types.includes("administrative_area_level_1"));
              if (stateComponent) {
                states.add(stateComponent.long_name);
              } else if (detailsData.result.name) {
                states.add(detailsData.result.name);
              }
            }
          } catch {
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

  async searchCities(input: string, countryName: string, stateName?: string): Promise<string[]> {
    if (!API_KEY || !input || !countryName || input.length < 1) {
      return [];
    }

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        countryName
      )}&key=${API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      let countryCode: string | null = null;
      if (geocodeData.status === "OK" && geocodeData.results?.length) {
        const countryResult = geocodeData.results.find((result: any) => result.types.includes("country"));
        if (countryResult) {
          const countryComponent = countryResult.address_components.find((component: any) =>
            component.types.includes("country")
          );
          countryCode = countryComponent?.short_name?.toLowerCase() || null;
        }
      }

      if (!countryCode) {
        return [];
      }

      const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&types=(cities)&components=country:${countryCode}&key=${API_KEY}`;

      const response = await fetch(autocompleteUrl);
      const data = await response.json();

      if (data.status !== "OK" || !data.predictions) {
        return [];
      }

      const cities = new Set<string>();
      for (const prediction of data.predictions.slice(0, 10)) {
        if (prediction.types?.includes("locality") || prediction.types?.includes("administrative_area_level_2")) {
          if (stateName) {
            try {
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=address_components,name&key=${API_KEY}`;
              const detailsResponse = await fetch(detailsUrl);
              const detailsData = await detailsResponse.json();

              if (detailsData.status === "OK" && detailsData.result) {
                const components = detailsData.result.address_components || [];
                const stateComponent = components.find((c: any) => c.types.includes("administrative_area_level_1"));
                if (stateComponent && stateComponent.long_name !== stateName) {
                  continue;
                }
              }
            } catch {
              // ignore
            }
          }
          if (prediction.description) {
            cities.add(prediction.description.split(",")[0].trim());
          }
        }
      }

      return Array.from(cities).sort().slice(0, 10);
    } catch (error) {
      console.error("Error searching cities:", error);
      return [];
    }
  }

  async getPlaceDetails(placeId: string): Promise<AddressComponents | null> {
    if (!API_KEY || !placeId) return null;

    try {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=address_components,formatted_address,geometry&key=${API_KEY}`;
      const response = await fetch(detailsUrl);
      const data = await response.json();

      if (data.status !== "OK" || !data.result) {
        return null;
      }

      return this.extractAddressComponents(data.result);
    } catch (error) {
      console.error("Error getting place details:", error);
      return null;
    }
  }

  private extractAddressComponents(place: any): AddressComponents {
    const components = place.address_components || [];

    const getComponent = (type: string) => {
      const component = components.find((c: any) => c.types.includes(type));
      return component ? component.long_name : "";
    };

    const country = getComponent("country");
    const state = getComponent("administrative_area_level_1");
    const city = getComponent("locality") || getComponent("administrative_area_level_2");
    const streetNumber = getComponent("street_number");
    const route = getComponent("route");
    const zipCode = getComponent("postal_code");

    const addressLineOne = [streetNumber, route].filter(Boolean).join(" ").trim();

    const geometry = place.geometry?.location;
    const latitude = geometry?.lat || 0;
    const longitude = geometry?.lng || 0;

    const formattedAddress = place.formatted_address || "";

    return {
      country,
      state,
      city,
      addressLineOne: addressLineOne || formattedAddress,
      latitude,
      longitude,
      formattedAddress,
      zipCode: zipCode || undefined,
    };
  }

  isWithinDeliveryRadius(
    userLat: number,
    userLon: number,
    restaurantLat: number,
    restaurantLon: number,
    deliveryRadius: number
  ): boolean {
    const distance = calculateDistance(userLat, userLon, restaurantLat, restaurantLon);
    return distance <= deliveryRadius;
  }
}

const googlePlacesService = GooglePlacesService.getInstance();
export default googlePlacesService;
