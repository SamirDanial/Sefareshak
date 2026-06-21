import { toast } from "sonner";

declare global {
  interface Window {
    google: any;
    initGooglePlaces?: () => void;
  }
}

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

export interface CountryInfo {
  name: string;
  hasStates: boolean;
}

type OnAddressChangeCallback = (components: AddressComponents) => void;
type OnLoadCallback = () => void;

type AutocompleteInitOptions = {
  types?: string[] | null;
  fields?: string[];
};

class GooglePlacesService {
  private static instance: GooglePlacesService;
  private isLoaded = false;
  private loadCallbacks: OnLoadCallback[] = [];

  private constructor() {}

  static getInstance(): GooglePlacesService {
    if (!GooglePlacesService.instance) {
      GooglePlacesService.instance = new GooglePlacesService();
    }
    return GooglePlacesService.instance;
  }

  /**
   * Load Google Places API script
   */
  async loadScript(onLoad?: OnLoadCallback): Promise<boolean> {
    if (onLoad) {
      this.loadCallbacks.push(onLoad);
    }

    if (this.isLoaded) {
      this.notifyCallbacks();
      return true;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.error("Google Places API key not found in environment variables");
      toast.error(
        "Google Places API key is missing. Please check your .env file."
      );
      return false;
    }

    // Check if Google Maps script is already loaded
    if (window.google && window.google.maps && window.google.maps.places) {
      this.isLoaded = true;
      this.notifyCallbacks();
      return true;
    }

    // Check if script is already in the DOM
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    ) as HTMLScriptElement | null;
    if (existingScript) {

      // Check if the script has the correct API key
      const scriptSrc = existingScript.src;
      const scriptApiKeyMatch = scriptSrc.match(/[?&]key=([^&]+)/);
      const scriptApiKey = scriptApiKeyMatch ? scriptApiKeyMatch[1] : null;

      if (scriptApiKey && scriptApiKey !== apiKey) {
        console.warn(
          "Existing script has different API key, removing and reloading..."
        );
        existingScript.remove();
        // Clean up old callback
        delete window.initGooglePlaces;
        // Load with correct key
        return this.loadGoogleScript(apiKey);
      }

      // Set up callback in case script hasn't loaded yet
      window.initGooglePlaces = () => {
        this.isLoaded = true;
        this.notifyCallbacks();
      };
      // Check if script has already loaded
      if (window.google && window.google.maps && window.google.maps.places) {
        this.isLoaded = true;
        this.notifyCallbacks();
        return true;
      }
      // Check if script failed to load (no onerror handler means we can't know)
      // Wait for it to load or timeout
      this.waitForGoogleLoad();
      return true;
    }

    // Load the Google Maps Places API script
    return this.loadGoogleScript(apiKey);
  }

  private waitForGoogleLoad(): void {
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds (100 * 100ms)

    const checkGoogle = setInterval(() => {
      attempts++;
      if (window.google && window.google.maps && window.google.maps.places) {
        clearInterval(checkGoogle);
        this.isLoaded = true;
        this.notifyCallbacks();
        return;
      }

      // If script exists but hasn't loaded after timeout, try to reload
      if (attempts >= maxAttempts) {
        clearInterval(checkGoogle);
        const existingScript = document.querySelector(
          'script[src*="maps.googleapis.com"]'
        ) as HTMLScriptElement | null;

        if (
          existingScript &&
          (!window.google || !window.google.maps || !window.google.maps.places)
        ) {
          console.warn(
            "Google Places API failed to load from existing script, removing and retrying..."
          );
          existingScript.remove();
          // Get API key and retry loading
          const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
          if (apiKey) {
            this.loadGoogleScript(apiKey);
          } else {
            console.error("Cannot retry: Google Places API key not found");
            toast.error(
              "Google Places API failed to load. Please refresh the page."
            );
          }
        }
      }
    }, 100);
  }

  private loadGoogleScript(apiKey: string): boolean {
    // Check again if script was added by another component
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    ) as HTMLScriptElement | null;
    if (existingScript) {
      // Set up callback and wait
      window.initGooglePlaces = () => {
        this.isLoaded = true;
        this.notifyCallbacks();
      };
      this.waitForGoogleLoad();
      return true;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGooglePlaces`;
    script.async = true;
    script.defer = true;

    // Set up global callback BEFORE adding script to DOM
    // This ensures callback is available when script loads
    window.initGooglePlaces = () => {
      this.isLoaded = true;
      this.notifyCallbacks();
    };

    script.onload = () => {
      // Double check after a short delay
      setTimeout(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          this.isLoaded = true;
          this.notifyCallbacks();
        } else {
          console.error("Google Places API not available after script load");
          // Check if callback was called but API isn't ready
          if (!this.isLoaded) {
            toast.error(
              "Google Places API loaded but Places library not available"
            );
          }
        }
      }, 500);
    };

    script.onerror = () => {
      console.error("Failed to load Google Places API script");
      // Remove failed script from DOM
      script.remove();
      // Clean up callback
      delete window.initGooglePlaces;
      toast.error(
        "Failed to load Google Places API. Check your API key and internet connection."
      );
    };

    document.head.appendChild(script);
    return true;
  }

  private notifyCallbacks(): void {
    this.loadCallbacks.forEach((callback) => callback());
    this.loadCallbacks = [];
  }

  /**
   * Check if Google Places API is loaded
   */
  isGoogleLoaded(): boolean {
    return (
      this.isLoaded &&
      window.google !== undefined &&
      window.google.maps !== undefined &&
      window.google.maps.places !== undefined
    );
  }

  /**
   * Initialize autocomplete on an input element
   */
  initializeAutocomplete(
    inputElement: HTMLInputElement,
    onPlaceChanged: OnAddressChangeCallback,
    options?: AutocompleteInitOptions
  ): any | null {
    if (!inputElement) {
      console.error("Input element is not available");
      return null;
    }

    if (!this.isGoogleLoaded()) {
      console.error("Google Places API is not loaded");
      toast.error("Google Places API is not loaded. Please refresh the page.");
      return null;
    }

    try {
      const types = options?.types === null ? null : (options?.types ?? ["address"]);
      const fields = options?.fields ?? ["address_components", "geometry", "formatted_address"];
      const autocomplete = new window.google.maps.places.Autocomplete(
        inputElement,
        {
          ...(types ? { types } : {}),
          fields,
        }
      );

      const handlePlaceChanged = () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
          toast.error("No address details available");
          return;
        }

        const components = this.extractAddressComponents(place);
        onPlaceChanged(components);
        toast.success("Address information filled automatically");
      };

      autocomplete.addListener("place_changed", handlePlaceChanged);

      return autocomplete;
    } catch (error) {
      console.error("Error initializing Google Places Autocomplete:", error);
      toast.error(
        "Failed to initialize address autocomplete. Please try refreshing the page."
      );
      return null;
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
    let neighborhood = "";
    let sublocality = "";
    let sublocalityLevel1 = "";
    let sublocalityLevel2 = "";

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
      } else if (types.includes("neighborhood")) {
        neighborhood = component.long_name;
      } else if (types.includes("sublocality")) {
        sublocality = component.long_name;
      } else if (types.includes("sublocality_level_1")) {
        sublocalityLevel1 = component.long_name;
      } else if (types.includes("sublocality_level_2")) {
        sublocalityLevel2 = component.long_name;
      }
    }

    // Build a better address if we don't have a street address
    if (!addressLineOne) {
      // Try to build from available components (neighborhood, sublocality, etc.)
      const addressParts: string[] = [];
      if (neighborhood) addressParts.push(neighborhood);
      else if (sublocalityLevel2) addressParts.push(sublocalityLevel2);
      else if (sublocalityLevel1) addressParts.push(sublocalityLevel1);
      else if (sublocality) addressParts.push(sublocality);
      
      if (addressParts.length > 0) {
        addressLineOne = addressParts.join(", ");
      }
    }

    // Build a comprehensive full address with all available components
    // Exclude city and country from the end as they're already shown in separate fields
    const fullAddressParts: string[] = [];
    
    // Add street address (street number + route) if available
    if (addressLineOne) {
      fullAddressParts.push(addressLineOne);
    }
    
    // Add neighborhood or sublocality for more specificity
    if (neighborhood) {
      fullAddressParts.push(neighborhood);
    } else if (sublocalityLevel2) {
      fullAddressParts.push(sublocalityLevel2);
    } else if (sublocalityLevel1) {
      fullAddressParts.push(sublocalityLevel1);
    } else if (sublocality) {
      fullAddressParts.push(sublocality);
    }
    
    // Add state/province
    if (state) {
      fullAddressParts.push(state);
    }
    
    // Add postal code
    if (zipCode) {
      fullAddressParts.push(zipCode);
    }
    
    // Don't add city and country - they're already shown in separate read-only fields
    
    // Build the comprehensive formatted address
    let formattedAddress = fullAddressParts.length > 0 
      ? fullAddressParts.join(", ")
      : place.formatted_address || "";
    
    // If we don't have enough components, fall back to Google's formatted_address
    // but clean it up: remove Plus Code, city, and country
    if (fullAddressParts.length < 2 && place.formatted_address) {
      let googleFormatted = place.formatted_address;
      
      // Check if formatted address contains a Plus Code (pattern: letter(s) + numbers + + + letter(s) + numbers)
      const plusCodePattern = /[A-Z0-9]{2,}\+[A-Z0-9]{2,}/;
      if (plusCodePattern.test(googleFormatted)) {
        // Remove Plus Code and clean up the address
        googleFormatted = googleFormatted.replace(plusCodePattern, "").replace(/^,\s*|\s*,\s*$/g, "").trim();
      }
      
      // Remove city and country from the end if they exist
      // Split by comma and remove last parts that match city or country
      const parts = googleFormatted.split(",").map((p: string) => p.trim());
      const cleanedParts: string[] = [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // Skip if it matches city or country
        if (part !== city && part !== country && part !== state) {
          cleanedParts.push(part);
        } else if (part === state && i < parts.length - 1) {
          // Keep state if it's not the last part
          cleanedParts.push(part);
        }
      }
      
      googleFormatted = cleanedParts.join(", ");
      
      // Use the comprehensive address if we built one, otherwise use cleaned Google formatted
      if (fullAddressParts.length > 0) {
        formattedAddress = fullAddressParts.join(", ");
      } else {
        formattedAddress = googleFormatted;
      }
    }

    // If addressLineOne is still empty, use the first part of formatted address
    if (!addressLineOne && formattedAddress) {
      // Extract the first part (usually street address or neighborhood)
      const firstPart = formattedAddress.split(",")[0].trim();
      addressLineOne = firstPart || formattedAddress;
    }

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    return {
      country,
      state,
      city,
      addressLineOne,
      latitude: lat,
      longitude: lng,
      formattedAddress: formattedAddress,
      zipCode: zipCode || undefined,
    };
  }

  /**
   * Search for countries using Google Places Autocomplete
   */
  searchCountries(
    input: string,
    onResults: (countries: string[]) => void,
    onLoading?: (loading: boolean) => void
  ): void {
    if (!this.isGoogleLoaded()) {
      onResults([]);
      return;
    }

    if (!input || input.length < 2) {
      onResults([]);
      return;
    }

    if (onLoading) onLoading(true);

    try {
      const service = new window.google.maps.places.AutocompleteService();
      const request = {
        input: input,
        types: ["(regions)"], // This includes countries
      };

      service.getPlacePredictions(
        request,
        async (predictions: any[], status: string) => {
          if (onLoading) onLoading(false);

          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            predictions
          ) {
            // Get place details to extract country information
            const placesService = new window.google.maps.places.PlacesService(
              document.createElement("div")
            );
            const countries = new Set<string>();

            // Process predictions to find ONLY countries
            const processPromises = predictions
              .slice(0, 10)
              .map((prediction: any) => {
                return new Promise<void>((resolve) => {
                  // First check if prediction types include "country" - skip if not
                  const isCountryType = prediction.types?.some(
                    (type: string) => type === "country"
                  );

                  if (!isCountryType) {
                    // Skip non-country types (states, cities, etc.)
                    resolve();
                    return;
                  }

                  // Get place details to verify and extract country name
                  placesService.getDetails(
                    {
                      placeId: prediction.place_id,
                      fields: ["address_components", "name", "types"],
                    },
                    (place: any, placeStatus: string) => {
                      if (
                        placeStatus ===
                          window.google.maps.places.PlacesServiceStatus.OK &&
                        place
                      ) {
                        // Verify this is actually a country by checking place types
                        const placeTypes = place.types || [];
                        const isCountry = placeTypes.some(
                          (type: string) => type === "country"
                        );

                        if (isCountry) {
                          // Extract country name from address components
                          const addressComponents =
                            place.address_components || [];
                          for (let i = 0; i < addressComponents.length; i++) {
                            const component = addressComponents[i];
                            if (component.types.includes("country")) {
                              countries.add(component.long_name);
                              break;
                            }
                          }

                          // Fallback: if no address component but it's verified as country, use place name
                          if (!countries.has(place.name || "") && place.name) {
                            countries.add(place.name);
                          }
                        }
                      }
                      resolve();
                    }
                  );
                });
              });

            await Promise.all(processPromises);

            // Convert to array and filter/sort
            const countryArray = Array.from(countries)
              .filter((c) => c.length > 0)
              .sort()
              .slice(0, 10); // Limit to 10 results

            onResults(countryArray);
          } else {
            onResults([]);
          }
        }
      );
    } catch (error) {
      console.error("Error searching countries:", error);
      if (onLoading) onLoading(false);
      onResults([]);
    }
  }

  /**
   * Check if a country uses states/provinces by dynamically querying Google Places API
   */
  checkCountryHasStates(
    countryName: string,
    onResult: (hasStates: boolean) => void
  ): void {
    if (!this.isGoogleLoaded() || !countryName) {
      onResult(false);
      return;
    }

    try {
      const geocoder = new window.google.maps.Geocoder();
      const autocompleteService =
        new window.google.maps.places.AutocompleteService();
      const placesService = new window.google.maps.places.PlacesService(
        document.createElement("div")
      );

      // Step 1: Get the country code by geocoding the country name
      geocoder.geocode(
        { address: countryName },
        (countryResults: any[], countryStatus: string) => {
          if (
            countryStatus !== window.google.maps.GeocoderStatus.OK ||
            !countryResults ||
            countryResults.length === 0
          ) {
            // If geocoding fails, default to showing state field
            onResult(true);
            return;
          }

          // Find the country result
          const countryResult = countryResults.find((result: any) =>
            result.types.includes("country")
          );

          if (!countryResult) {
            onResult(true);
            return;
          }

          // Get the country code (2-letter ISO code)
          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          const countryCode = countryComponent?.short_name?.toLowerCase();

          if (!countryCode) {
            onResult(true);
            return;
          }

          // Step 2: Search for a city in this country using Places Autocomplete
          // This will return results with full address components including states if they exist
          autocompleteService.getPlacePredictions(
            {
              input: countryName,
              componentRestrictions: { country: countryCode },
              types: ["(cities)"],
            },
            (predictions: any[], predictionsStatus: string) => {
              if (
                predictionsStatus ===
                  window.google.maps.places.PlacesServiceStatus.OK &&
                predictions &&
                predictions.length > 0
              ) {
                // Step 3: Get details of the first city to check for administrative_area_level_1
                placesService.getDetails(
                  {
                    placeId: predictions[0].place_id,
                    fields: ["address_components"],
                  },
                  (place: any, placeStatus: string) => {
                    if (
                      placeStatus ===
                        window.google.maps.places.PlacesServiceStatus.OK &&
                      place &&
                      place.address_components
                    ) {
                      // Check if this city has administrative_area_level_1 (state/province)
                      const hasState = place.address_components.some(
                        (component: any) =>
                          component.types.includes(
                            "administrative_area_level_1"
                          )
                      );
                      onResult(hasState);
                    } else {
                      // If getting place details fails, try alternative approach
                      this.checkStateAlternative(countryCode, onResult);
                    }
                  }
                );
              } else {
                // If city search fails, try alternative approach with region search
                this.checkStateAlternative(countryCode, onResult);
              }
            }
          );
        }
      );
    } catch (error) {
      console.error("Error checking country states:", error);
      // Default to showing state field to be safe
      onResult(true);
    }
  }

  /**
   * Alternative method to check if country has states by searching for regions
   */
  private checkStateAlternative(
    countryCode: string,
    onResult: (hasStates: boolean) => void
  ): void {
    const autocompleteService =
      new window.google.maps.places.AutocompleteService();
    const placesService = new window.google.maps.places.PlacesService(
      document.createElement("div")
    );

    // Search for regions in this country
    autocompleteService.getPlacePredictions(
      {
        input: "",
        componentRestrictions: { country: countryCode },
        types: ["(regions)"],
      },
      (predictions: any[], status: string) => {
        if (
          status === window.google.maps.places.PlacesServiceStatus.OK &&
          predictions &&
          predictions.length > 0
        ) {
          // Check if any prediction is a state/province (administrative_area_level_1)
          const statePredictions = predictions.filter((prediction: any) =>
            prediction.types?.includes("administrative_area_level_1")
          );

          if (statePredictions.length > 0) {
            // Found states, verify by getting details
            placesService.getDetails(
              {
                placeId: statePredictions[0].place_id,
                fields: ["address_components", "types"],
              },
              (place: any, placeStatus: string) => {
                if (
                  placeStatus ===
                    window.google.maps.places.PlacesServiceStatus.OK &&
                  place
                ) {
                  const isState = place.types?.includes(
                    "administrative_area_level_1"
                  );
                  onResult(isState || false);
                } else {
                  onResult(true); // Default to showing
                }
              }
            );
          } else {
            // No state predictions found
            onResult(false);
          }
        } else {
          // If search fails completely, default to showing state field
          onResult(true);
        }
      }
    );
  }

  /**
   * Search for states/provinces in a given country
   */
  searchStates(
    stateInput: string,
    countryName: string,
    onResults: (states: string[]) => void,
    onLoading?: (loading: boolean) => void
  ): void {
    if (
      !this.isGoogleLoaded() ||
      !countryName ||
      !stateInput ||
      stateInput.length < 1
    ) {
      onResults([]);
      return;
    }

    if (onLoading) onLoading(true);

    try {
      const geocoder = new window.google.maps.Geocoder();
      const autocompleteService =
        new window.google.maps.places.AutocompleteService();

      // First get the country code
      geocoder.geocode(
        { address: countryName },
        (countryResults: any[], countryStatus: string) => {
          if (
            countryStatus !== window.google.maps.GeocoderStatus.OK ||
            !countryResults ||
            countryResults.length === 0
          ) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          const countryResult = countryResults.find((result: any) =>
            result.types.includes("country")
          );

          if (!countryResult) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          const countryCode = countryComponent?.short_name?.toLowerCase();

          if (!countryCode) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          // Search for administrative areas (states/provinces) in this country
          autocompleteService.getPlacePredictions(
            {
              input: stateInput,
              componentRestrictions: { country: countryCode },
              types: ["(regions)"],
            },
            async (predictions: any[], status: string) => {
              if (onLoading) onLoading(false);

              if (
                status === window.google.maps.places.PlacesServiceStatus.OK &&
                predictions &&
                predictions.length > 0
              ) {
                const placesService =
                  new window.google.maps.places.PlacesService(
                    document.createElement("div")
                  );
                const states = new Set<string>();

                // Process predictions to find ONLY states/provinces (administrative_area_level_1)
                const processPromises = predictions
                  .slice(0, 10)
                  .map((prediction) => {
                    return new Promise<void>((resolve) => {
                      // Check if prediction type is administrative_area_level_1
                      const isStateType = prediction.types?.some(
                        (type: string) => type === "administrative_area_level_1"
                      );

                      if (!isStateType) {
                        resolve();
                        return;
                      }

                      // Get place details to verify and extract state name
                      placesService.getDetails(
                        {
                          placeId: prediction.place_id,
                          fields: ["address_components", "name", "types"],
                        },
                        (place: any, placeStatus: string) => {
                          if (
                            placeStatus ===
                              window.google.maps.places.PlacesServiceStatus
                                .OK &&
                            place
                          ) {
                            // Verify this is actually a state by checking types
                            const placeTypes = place.types || [];
                            const isState = placeTypes.some(
                              (type: string) =>
                                type === "administrative_area_level_1"
                            );

                            if (isState) {
                              // Extract state name from address components
                              const addressComponents =
                                place.address_components || [];
                              for (
                                let i = 0;
                                i < addressComponents.length;
                                i++
                              ) {
                                const component = addressComponents[i];
                                if (
                                  component.types.includes(
                                    "administrative_area_level_1"
                                  )
                                ) {
                                  states.add(component.long_name);
                                  break;
                                }
                              }

                              // Fallback: use place name if no component found
                              if (states.size === 0 && place.name) {
                                states.add(place.name);
                              }
                            }
                          }
                          resolve();
                        }
                      );
                    });
                  });

                await Promise.all(processPromises);

                // Convert to array and filter/sort
                const stateArray = Array.from(states)
                  .filter((s) => s.length > 0)
                  .sort()
                  .slice(0, 10); // Limit to 10 results

                onResults(stateArray);
              } else {
                onResults([]);
              }
            }
          );
        }
      );
    } catch (error) {
      console.error("Error searching states:", error);
      if (onLoading) onLoading(false);
      onResults([]);
    }
  }

  /**
   * Search for cities in a given country and optionally state
   */
  searchCities(
    cityInput: string,
    countryName: string,
    onResults: (cities: string[]) => void,
    stateName?: string,
    onLoading?: (loading: boolean) => void
  ): void {
    if (
      !this.isGoogleLoaded() ||
      !countryName ||
      !cityInput ||
      cityInput.length < 1
    ) {
      onResults([]);
      return;
    }

    if (onLoading) onLoading(true);

    try {
      const geocoder = new window.google.maps.Geocoder();
      const autocompleteService =
        new window.google.maps.places.AutocompleteService();

      // First get the country code
      geocoder.geocode(
        { address: countryName },
        (countryResults: any[], countryStatus: string) => {
          if (
            countryStatus !== window.google.maps.GeocoderStatus.OK ||
            !countryResults ||
            countryResults.length === 0
          ) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          const countryResult = countryResults.find((result: any) =>
            result.types.includes("country")
          );

          if (!countryResult) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          const countryCode = countryComponent?.short_name?.toLowerCase();

          if (!countryCode) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          // Prepare component restrictions (only country is supported)
          const componentRestrictions: any = { country: countryCode };

          // Build search query: if state is provided, include it in the search input
          // This helps filter cities by state since componentRestrictions doesn't support states
          let searchQuery = cityInput;
          if (stateName) {
            searchQuery = `${cityInput}, ${stateName}`;
          }

          // Search for cities
          this.performCitySearch(
            autocompleteService,
            searchQuery,
            componentRestrictions,
            stateName, // Pass state name for filtering
            onResults,
            onLoading
          );
        }
      );
    } catch (error) {
      console.error("Error searching cities:", error);
      if (onLoading) onLoading(false);
      onResults([]);
    }
  }

  /**
   * Perform the actual city search using Places Autocomplete
   */
  private performCitySearch(
    autocompleteService: any,
    cityInput: string,
    componentRestrictions: any,
    stateName?: string,
    onResults?: (cities: string[]) => void,
    onLoading?: (loading: boolean) => void
  ): void {
    if (!onResults) return;
    autocompleteService.getPlacePredictions(
      {
        input: cityInput,
        componentRestrictions: componentRestrictions,
        types: ["(cities)"],
      },
      async (predictions: any[], status: string) => {
        if (onLoading) onLoading(false);

        if (
          status === window.google.maps.places.PlacesServiceStatus.OK &&
          predictions &&
          predictions.length > 0
        ) {
          const placesService = new window.google.maps.places.PlacesService(
            document.createElement("div")
          );
          const cities = new Set<string>();

          // Process predictions to extract city names
          const processPromises = predictions
            .slice(0, 10)
            .map((prediction: any) => {
              return new Promise<void>((resolve) => {
                // Check if prediction type includes locality or sublocality
                const isCityType =
                  prediction.types?.some(
                    (type: string) =>
                      type === "locality" ||
                      type === "sublocality" ||
                      type === "sublocality_level_1"
                  ) || false;

                if (!isCityType && !prediction.types?.includes("(cities)")) {
                  resolve();
                  return;
                }

                // Get place details to extract city name
                placesService.getDetails(
                  {
                    placeId: prediction.place_id,
                    fields: ["address_components", "name", "types"],
                  },
                  (place: any, placeStatus: string) => {
                    if (
                      placeStatus ===
                        window.google.maps.places.PlacesServiceStatus.OK &&
                      place
                    ) {
                      // Verify this is actually a city
                      const placeTypes = place.types || [];
                      const isCity =
                        placeTypes.some(
                          (type: string) =>
                            type === "locality" ||
                            type === "sublocality" ||
                            type === "sublocality_level_1"
                        ) || false;

                      if (isCity || placeTypes.includes("(cities)")) {
                        // If state is provided, verify the city is in that state
                        if (stateName) {
                          const addressComponents =
                            place.address_components || [];
                          const stateComponent = addressComponents.find(
                            (comp: any) =>
                              comp.types.includes("administrative_area_level_1")
                          );

                          // Check if the state matches
                          const cityStateName = stateComponent?.long_name || "";
                          const cityStateShort =
                            stateComponent?.short_name || "";

                          // Normalize for comparison (case insensitive)
                          const normalizedStateName = stateName
                            .toLowerCase()
                            .trim();
                          const normalizedCityState = cityStateName
                            .toLowerCase()
                            .trim();
                          const normalizedCityStateShort = cityStateShort
                            .toLowerCase()
                            .trim();

                          // Only include city if state matches
                          if (
                            normalizedCityState === normalizedStateName ||
                            normalizedCityStateShort === normalizedStateName ||
                            cityStateName === stateName ||
                            cityStateShort === stateName
                          ) {
                            // Extract city name from address components
                            for (let i = 0; i < addressComponents.length; i++) {
                              const component = addressComponents[i];
                              if (
                                component.types.includes("locality") ||
                                component.types.includes("sublocality") ||
                                component.types.includes("sublocality_level_1")
                              ) {
                                cities.add(component.long_name);
                                break;
                              }
                            }

                            // Fallback: use place name if no component found
                            if (!cities.has(place.name || "") && place.name) {
                              cities.add(place.name);
                            }
                          }
                        } else {
                          // No state filter, just extract city name
                          const addressComponents =
                            place.address_components || [];
                          for (let i = 0; i < addressComponents.length; i++) {
                            const component = addressComponents[i];
                            if (
                              component.types.includes("locality") ||
                              component.types.includes("sublocality") ||
                              component.types.includes("sublocality_level_1")
                            ) {
                              cities.add(component.long_name);
                              break;
                            }
                          }

                          // Fallback: use place name if no component found
                          if (!cities.has(place.name || "") && place.name) {
                            cities.add(place.name);
                          }
                        }
                      }
                    }
                    resolve();
                  }
                );
              });
            });

          await Promise.all(processPromises);

          // Convert to array and filter/sort
          const cityArray = Array.from(cities)
            .filter((c) => c.length > 0)
            .sort()
            .slice(0, 10); // Limit to 10 results

          onResults(cityArray);
        } else {
          onResults([]);
        }
      }
    );
  }

  /**
   * Search for street addresses based on city, state, and country
   * Optionally filter by delivery radius from restaurant location
   */
  searchAddresses(
    addressInput: string,
    countryName: string,
    cityName: string,
    stateName?: string,
    onResults?: (addresses: string[]) => void,
    onLoading?: (loading: boolean) => void,
    restaurantLat?: number,
    restaurantLon?: number,
    deliveryRadius?: number
  ): void {
    if (!onResults) return;

    if (
      !this.isGoogleLoaded() ||
      !countryName ||
      !cityName ||
      !addressInput ||
      addressInput.length < 1
    ) {
      onResults([]);
      return;
    }

    if (onLoading) onLoading(true);

    try {
      const geocoder = new window.google.maps.Geocoder();
      const autocompleteService =
        new window.google.maps.places.AutocompleteService();

      // Build search query - include city name to help Google provide better results
      // The city filtering will also be done after getting results to ensure accuracy
      // Format: "address input, city name" - this helps Google understand the context
      const searchQuery = addressInput.trim() 
        ? `${addressInput}, ${cityName}`
        : cityName;

      // First get country code
      geocoder.geocode(
        { address: countryName },
        (countryResults: any[], countryStatus: string) => {
          if (
            countryStatus !== window.google.maps.GeocoderStatus.OK ||
            !countryResults ||
            countryResults.length === 0
          ) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          const countryResult = countryResults.find((result: any) =>
            result.types.includes("country")
          );

          if (!countryResult) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          const countryCode = countryComponent?.short_name?.toLowerCase();

          if (!countryCode) {
            if (onLoading) onLoading(false);
            onResults([]);
            return;
          }

          // Use address autocomplete (not cities)
          autocompleteService.getPlacePredictions(
            {
              input: searchQuery,
              componentRestrictions: { country: countryCode },
              types: ["address"], // Search for addresses (streets)
            },
            async (predictions: any[], status: string) => {
              if (onLoading) onLoading(false);

              if (
                status === window.google.maps.places.PlacesServiceStatus.OK &&
                predictions &&
                predictions.length > 0
              ) {
                const placesService =
                  new window.google.maps.places.PlacesService(
                    document.createElement("div")
                  );
                const addresses = new Set<string>();

                const processPromises = predictions
                  .slice(0, 10)
                  .map((prediction: any) => {
                    return new Promise<void>((resolve) => {
                      // Verify this is an address type
                      const isAddressType =
                        prediction.types?.some(
                          (type: string) =>
                            type === "street_address" ||
                            type === "route" ||
                            type === "premise"
                        ) || false;

                      if (
                        !isAddressType &&
                        !prediction.types?.includes("address")
                      ) {
                        resolve();
                        return;
                      }

                      placesService.getDetails(
                        {
                          placeId: prediction.place_id,
                          fields: [
                            "address_components",
                            "name",
                            "types",
                            "formatted_address",
                            "geometry",
                          ],
                        },
                        (place: any, placeStatus: string) => {
                          if (
                            placeStatus ===
                              window.google.maps.places.PlacesServiceStatus
                                .OK &&
                            place
                          ) {
                            const placeTypes = place.types || [];
                            const isAddress =
                              placeTypes.some(
                                (type: string) =>
                                  type === "street_address" ||
                                  type === "route" ||
                                  type === "premise"
                              ) || false;

                            if (isAddress || placeTypes.includes("address")) {
                              const addressComponents =
                                place.address_components || [];

                              // Verify city matches - check multiple city-related types
                              let cityMatches = false;
                              const normalizeCity = (city: string) =>
                                city.toLowerCase().trim().replace(/\s+/g, " ");
                              const normalizedTargetCity = normalizeCity(cityName);
                              
                              for (const component of addressComponents) {
                                if (
                                  component.types.includes("locality") ||
                                  component.types.includes(
                                    "administrative_area_level_2"
                                  ) ||
                                  component.types.includes("sublocality") ||
                                  component.types.includes("sublocality_level_1") ||
                                  component.types.includes("sublocality_level_2")
                                ) {
                                  const componentCity = normalizeCity(component.long_name);
                                  // Exact match or partial match (city name contains or is contained in component)
                                  if (
                                    componentCity === normalizedTargetCity ||
                                    componentCity.includes(normalizedTargetCity) ||
                                    normalizedTargetCity.includes(componentCity)
                                  ) {
                                    cityMatches = true;
                                    break;
                                  }
                                }
                              }
                              
                              // Also check if formatted address contains the city name as a fallback
                              if (!cityMatches && place.formatted_address) {
                                const formattedLower = place.formatted_address.toLowerCase();
                                if (formattedLower.includes(normalizedTargetCity)) {
                                  cityMatches = true;
                                }
                              }

                              // Verify state matches if provided
                              let stateMatches = true; // Default to true if no state filter
                              if (stateName) {
                                stateMatches = false;
                                for (const component of addressComponents) {
                                  if (
                                    component.types.includes(
                                      "administrative_area_level_1"
                                    )
                                  ) {
                                    const componentState = component.long_name
                                      .toLowerCase()
                                      .trim();
                                    const componentStateShort =
                                      component.short_name.toLowerCase().trim();
                                    const selectedState = stateName
                                      .toLowerCase()
                                      .trim();
                                    if (
                                      componentState === selectedState ||
                                      componentStateShort === selectedState ||
                                      component.long_name === stateName ||
                                      component.short_name === stateName
                                    ) {
                                      stateMatches = true;
                                      break;
                                    }
                                  }
                                }
                              }

                              // Only include address if city (and optionally state) matches
                              if (cityMatches && stateMatches) {
                                // Check delivery radius if provided
                                let withinRadius = true;
                                if (
                                  restaurantLat !== undefined &&
                                  restaurantLon !== undefined &&
                                  deliveryRadius !== undefined &&
                                  deliveryRadius > 0 &&
                                  place.geometry &&
                                  place.geometry.location
                                ) {
                                  const placeLat =
                                    typeof place.geometry.location.lat ===
                                    "function"
                                      ? place.geometry.location.lat()
                                      : place.geometry.location.lat;
                                  const placeLon =
                                    typeof place.geometry.location.lng ===
                                    "function"
                                      ? place.geometry.location.lng()
                                      : place.geometry.location.lng;

                                  // Calculate distance using Haversine formula
                                  const R = 6371; // Earth radius in km
                                  const dLat =
                                    ((placeLat - restaurantLat) * Math.PI) /
                                    180;
                                  const dLon =
                                    ((placeLon - restaurantLon) * Math.PI) /
                                    180;
                                  const a =
                                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                                    Math.cos((restaurantLat * Math.PI) / 180) *
                                      Math.cos((placeLat * Math.PI) / 180) *
                                      Math.sin(dLon / 2) *
                                      Math.sin(dLon / 2);
                                  const c =
                                    2 *
                                    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                                  const distance = R * c; // Distance in km

                                  withinRadius = distance <= deliveryRadius;
                                }

                                if (withinRadius) {
                                  // Use formatted address as full address
                                  let fullAddress = "";

                                  if (place.formatted_address) {
                                    // Prefer formatted address from Google
                                    fullAddress = place.formatted_address;
                                  } else {
                                    // Fallback: construct full address from components
                                    let streetNumber = "";
                                    let route = "";
                                    let city = "";
                                    let state = "";
                                    let zipCode = "";

                                    for (const component of addressComponents) {
                                      if (
                                        component.types.includes(
                                          "street_number"
                                        )
                                      ) {
                                        streetNumber = component.long_name;
                                      } else if (
                                        component.types.includes("route")
                                      ) {
                                        route = component.long_name;
                                      } else if (
                                        component.types.includes("locality")
                                      ) {
                                        city = component.long_name;
                                      } else if (
                                        component.types.includes(
                                          "administrative_area_level_1"
                                        )
                                      ) {
                                        state = component.long_name;
                                      } else if (
                                        component.types.includes("postal_code")
                                      ) {
                                        zipCode = component.long_name;
                                      }
                                    }

                                    // Build full address
                                    const addressParts: string[] = [];
                                    if (streetNumber && route) {
                                      addressParts.push(
                                        `${streetNumber} ${route}`
                                      );
                                    } else if (route) {
                                      addressParts.push(route);
                                    } else if (streetNumber) {
                                      addressParts.push(streetNumber);
                                    }
                                    if (city) addressParts.push(city);
                                    if (state) addressParts.push(state);
                                    if (zipCode) addressParts.push(zipCode);

                                    fullAddress = addressParts.join(", ");
                                  }

                                  if (fullAddress) {
                                    addresses.add(fullAddress);
                                  }
                                }
                              }
                            }
                          }
                          resolve();
                        }
                      );
                    });
                  });

                await Promise.all(processPromises);

                const addressArray = Array.from(addresses)
                  .filter((a) => a.length > 0)
                  .slice(0, 10);

                onResults(addressArray);
              } else {
                onResults([]);
              }
            }
          );
        }
      );
    } catch (error) {
      console.error("Error searching addresses:", error);
      if (onLoading) onLoading(false);
      onResults([]);
    }
  }

  /**
   * Reverse geocode coordinates to get address details
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    onSuccess: OnAddressChangeCallback,
    onError?: (error: string) => void
  ): Promise<void> {
    if (!this.isGoogleLoaded()) {
      const errorMsg = "Google Places API is not loaded";
      toast.error(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    // Validate coordinates
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      isNaN(latitude) ||
      isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      const errorMsg = "Invalid latitude or longitude values";
      toast.error(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    try {
      const geocoder = new window.google.maps.Geocoder();
      const latlng = { lat: latitude, lng: longitude };

      geocoder.geocode(
        { location: latlng },
        (results: any[], status: string) => {
          if (status === "OK" && results[0]) {
            const place = results[0];
            const components = this.extractAddressComponents(place);
            // Ensure coordinates are set
            components.latitude = latitude;
            components.longitude = longitude;
            onSuccess(components);
          } else {
            // At least return the coordinates even if reverse geocoding fails
            const components: AddressComponents = {
              country: "",
              state: "",
              city: "",
              addressLineOne: "",
              latitude: latitude,
              longitude: longitude,
              formattedAddress: "",
              zipCode: undefined,
            };
            onSuccess(components);
            const errorMsg = "Could not retrieve address from coordinates";
            console.error(errorMsg);
            toast.error(errorMsg);
            if (onError) onError(errorMsg);
          }
        }
      );
    } catch (error) {
      const errorMsg =
        "Error during reverse geocoding: " + (error as Error).message;
      console.error("Error reverse geocoding:", error);
      toast.error(errorMsg);
      if (onError) onError(errorMsg);
    }
  }

  /**
   * Get current location using GPS and reverse geocode it
   */
  async getCurrentLocation(
    onSuccess: OnAddressChangeCallback,
    onError?: (error: string) => void
  ): Promise<void> {
    if (!navigator.geolocation) {
      const errorMsg = "Geolocation is not supported by your browser";
      toast.error(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    if (!this.isGoogleLoaded()) {
      const errorMsg = "Google Places API is not loaded";
      toast.error(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Reverse geocode to get address details
        const geocoder = new window.google.maps.Geocoder();
        const latlng = { lat, lng };

        geocoder.geocode(
          { location: latlng },
          (results: any[], status: string) => {
            if (status === "OK" && results[0]) {
              const place = results[0];
              const components = this.extractAddressComponents(place);
              onSuccess(components);
            } else {
              // At least return the coordinates even if reverse geocoding fails
              const components: AddressComponents = {
                country: "",
                state: "",
                city: "",
                addressLineOne: "",
                latitude: lat,
                longitude: lng,
                formattedAddress: "",
                zipCode: undefined,
              };
              onSuccess(components);
              const errorMsg = "Could not retrieve address from coordinates";
              console.error(errorMsg);
              toast.error(errorMsg);
            }
          }
        );
      },
      (error) => {
        const errorMsg = "Failed to get location: " + error.message;
        console.error("Error getting location:", error);
        toast.error(errorMsg);
        if (onError) onError(errorMsg);
      }
    );
  }
}

export default GooglePlacesService.getInstance();
