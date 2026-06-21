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
}

type OnAddressChangeCallback = (components: AddressComponents) => void;
type OnLoadCallback = () => void;

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
      window.initGooglePlaces = () => {
        this.isLoaded = true;
        this.notifyCallbacks();
      };
      this.waitForGoogleLoad();
      return true;
    }

    return this.loadGoogleScript(apiKey);
  }

  private waitForGoogleLoad(): void {
    let attempts = 0;
    const maxAttempts = 100;

    const checkGoogle = setInterval(() => {
      attempts++;
      if (window.google && window.google.maps && window.google.maps.places) {
        clearInterval(checkGoogle);
        this.isLoaded = true;
        this.notifyCallbacks();
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkGoogle);
        const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
        if (apiKey) {
          this.loadGoogleScript(apiKey);
        }
      }
    }, 100);
  }

  private loadGoogleScript(apiKey: string): boolean {
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    ) as HTMLScriptElement | null;
    if (existingScript) {
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

    window.initGooglePlaces = () => {
      this.isLoaded = true;
      this.notifyCallbacks();
    };

    script.onload = () => {
      setTimeout(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          this.isLoaded = true;
          this.notifyCallbacks();
        }
      }, 500);
    };

    script.onerror = () => {
      console.error("Failed to load Google Places API script");
      script.remove();
      delete window.initGooglePlaces;
    };

    document.head.appendChild(script);
    return true;
  }

  private notifyCallbacks(): void {
    this.loadCallbacks.forEach((callback) => callback());
    this.loadCallbacks = [];
  }

  isGoogleLoaded(): boolean {
    return (
      this.isLoaded &&
      window.google !== undefined &&
      window.google.maps !== undefined &&
      window.google.maps.places !== undefined
    );
  }

  private extractAddressComponents(place: any): AddressComponents {
    const addressComponents = place.address_components || [];
    let country = "";
    let state = "";
    let city = "";
    let addressLineOne = "";

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
      }
    }

    if (!addressLineOne && place.formatted_address) {
      addressLineOne = place.formatted_address;
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
      formattedAddress: place.formatted_address || "",
    };
  }

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

      geocoder.geocode(
        { address: countryName },
        (countryResults: any[], countryStatus: string) => {
          if (
            countryStatus !== window.google.maps.GeocoderStatus.OK ||
            !countryResults ||
            countryResults.length === 0
          ) {
            onResult(true);
            return;
          }

          const countryResult = countryResults.find((result: any) =>
            result.types.includes("country")
          );

          if (!countryResult) {
            onResult(true);
            return;
          }

          const countryComponent = countryResult.address_components.find(
            (component: any) => component.types.includes("country")
          );
          const countryCode = countryComponent?.short_name?.toLowerCase();

          if (!countryCode) {
            onResult(true);
            return;
          }

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
                      const hasState = place.address_components.some(
                        (component: any) =>
                          component.types.includes(
                            "administrative_area_level_1"
                          )
                      );
                      onResult(hasState);
                    } else {
                      onResult(true);
                    }
                  }
                );
              } else {
                onResult(true);
              }
            }
          );
        }
      );
    } catch (error) {
      console.error("Error checking country states:", error);
      onResult(true);
    }
  }

  searchCountries(
    input: string,
    onResults: (countries: string[]) => void,
    onLoading?: (loading: boolean) => void
  ): void {
    if (!this.isGoogleLoaded() || !input || input.length < 2) {
      onResults([]);
      return;
    }

    if (onLoading) onLoading(true);

    try {
      const service = new window.google.maps.places.AutocompleteService();
      const request = {
        input: input,
        types: ["(regions)"],
      };

      service.getPlacePredictions(
        request,
        async (predictions: any[], status: string) => {
          if (onLoading) onLoading(false);

          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            predictions
          ) {
            const placesService = new window.google.maps.places.PlacesService(
              document.createElement("div")
            );
            const countries = new Set<string>();

            const processPromises = predictions
              .slice(0, 10)
              .map((prediction: any) => {
                return new Promise<void>((resolve) => {
                  const isCountryType = prediction.types?.some(
                    (type: string) => type === "country"
                  );

                  if (!isCountryType) {
                    resolve();
                    return;
                  }

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
                        const placeTypes = place.types || [];
                        const isCountry = placeTypes.some(
                          (type: string) => type === "country"
                        );

                        if (isCountry) {
                          const addressComponents =
                            place.address_components || [];
                          for (let i = 0; i < addressComponents.length; i++) {
                            const component = addressComponents[i];
                            if (component.types.includes("country")) {
                              countries.add(component.long_name);
                              break;
                            }
                          }

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

            const countryArray = Array.from(countries)
              .filter((c) => c.length > 0)
              .sort()
              .slice(0, 10);

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

                const processPromises = predictions
                  .slice(0, 10)
                  .map((prediction) => {
                    return new Promise<void>((resolve) => {
                      const isStateType = prediction.types?.some(
                        (type: string) => type === "administrative_area_level_1"
                      );

                      if (!isStateType) {
                        resolve();
                        return;
                      }

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
                            const placeTypes = place.types || [];
                            const isState = placeTypes.some(
                              (type: string) =>
                                type === "administrative_area_level_1"
                            );

                            if (isState) {
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

                const stateArray = Array.from(states)
                  .filter((s) => s.length > 0)
                  .sort()
                  .slice(0, 10);

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

          let searchQuery = cityInput;
          if (stateName) {
            searchQuery = `${cityInput}, ${stateName}`;
          }

          autocompleteService.getPlacePredictions(
            {
              input: searchQuery,
              componentRestrictions: { country: countryCode },
              types: ["(cities)"],
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
                const cities = new Set<string>();

                const processPromises = predictions
                  .slice(0, 10)
                  .map((prediction: any) => {
                    return new Promise<void>((resolve) => {
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
                            const placeTypes = place.types || [];
                            const isCity =
                              placeTypes.some(
                                (type: string) =>
                                  type === "locality" ||
                                  type === "sublocality" ||
                                  type === "sublocality_level_1"
                              ) || false;

                            if (isCity || placeTypes.includes("(cities)")) {
                              if (stateName) {
                                const addressComponents =
                                  place.address_components || [];
                                const stateComponent = addressComponents.find(
                                  (comp: any) =>
                                    comp.types.includes(
                                      "administrative_area_level_1"
                                    )
                                );

                                const cityStateName = stateComponent?.long_name || "";
                                const normalizedStateName = stateName
                                  .toLowerCase()
                                  .trim();
                                const normalizedCityState = cityStateName
                                  .toLowerCase()
                                  .trim();

                                if (
                                  normalizedCityState === normalizedStateName ||
                                  cityStateName === stateName
                                ) {
                                  for (let i = 0; i < addressComponents.length; i++) {
                                    const component = addressComponents[i];
                                    if (
                                      component.types.includes("locality") ||
                                      component.types.includes("sublocality")
                                    ) {
                                      cities.add(component.long_name);
                                      break;
                                    }
                                  }

                                  if (!cities.has(place.name || "") && place.name) {
                                    cities.add(place.name);
                                  }
                                }
                              } else {
                                const addressComponents =
                                  place.address_components || [];
                                for (let i = 0; i < addressComponents.length; i++) {
                                  const component = addressComponents[i];
                                  if (
                                    component.types.includes("locality") ||
                                    component.types.includes("sublocality")
                                  ) {
                                    cities.add(component.long_name);
                                    break;
                                  }
                                }

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

                const cityArray = Array.from(cities)
                  .filter((c) => c.length > 0)
                  .sort()
                  .slice(0, 10);

                onResults(cityArray);
              } else {
                onResults([]);
              }
            }
          );
        }
      );
    } catch (error) {
      console.error("Error searching cities:", error);
      if (onLoading) onLoading(false);
      onResults([]);
    }
  }

  searchAddresses(
    addressInput: string,
    countryName: string,
    cityName: string,
    stateName?: string,
    onResults?: (addresses: string[]) => void,
    onLoading?: (loading: boolean) => void
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

      let searchQuery = `${addressInput}`;
      if (stateName) {
        searchQuery = `${addressInput}, ${cityName}, ${stateName}, ${countryName}`;
      } else {
        searchQuery = `${addressInput}, ${cityName}, ${countryName}`;
      }

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

          autocompleteService.getPlacePredictions(
            {
              input: searchQuery,
              componentRestrictions: { country: countryCode },
              types: ["address"],
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

                              let cityMatches = false;
                              for (const component of addressComponents) {
                                if (
                                  component.types.includes("locality") ||
                                  component.types.includes(
                                    "administrative_area_level_2"
                                  )
                                ) {
                                  const componentCity = component.long_name
                                    .toLowerCase()
                                    .trim();
                                  const selectedCity = cityName
                                    .toLowerCase()
                                    .trim();
                                  if (componentCity === selectedCity) {
                                    cityMatches = true;
                                    break;
                                  }
                                }
                              }

                              let stateMatches = true;
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
                                    const selectedState = stateName
                                      .toLowerCase()
                                      .trim();
                                    if (
                                      componentState === selectedState ||
                                      component.long_name === stateName
                                    ) {
                                      stateMatches = true;
                                      break;
                                    }
                                  }
                                }
                              }

                              if (cityMatches && stateMatches) {
                                if (place.formatted_address) {
                                  addresses.add(place.formatted_address);
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

  async reverseGeocode(
    latitude: number,
    longitude: number,
    onSuccess: OnAddressChangeCallback,
    onError?: (error: string) => void
  ): Promise<void> {
    if (!this.isGoogleLoaded()) {
      const errorMsg = "Google Places API is not loaded";
      if (onError) onError(errorMsg);
      return;
    }

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
            components.latitude = latitude;
            components.longitude = longitude;
            onSuccess(components);
          } else {
            const components: AddressComponents = {
              country: "",
              state: "",
              city: "",
              addressLineOne: "",
              latitude: latitude,
              longitude: longitude,
              formattedAddress: "",
            };
            onSuccess(components);
            if (onError) onError("Could not retrieve address from coordinates");
          }
        }
      );
    } catch (error) {
      const errorMsg =
        "Error during reverse geocoding: " + (error as Error).message;
      console.error("Error reverse geocoding:", error);
      if (onError) onError(errorMsg);
    }
  }

  async getCurrentLocation(
    onSuccess: OnAddressChangeCallback,
    onError?: (error: string) => void
  ): Promise<void> {
    
    if (!navigator.geolocation) {
      const errorMsg = "Geolocation is not supported by your browser";
      console.error(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    if (!this.isGoogleLoaded()) {
      const errorMsg = "Google Places API is not loaded";
      console.error(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }
    // Use options with longer timeout for desktop (WiFi/IP location can be slow)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

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
              };
              onSuccess(components);
              const errorMsg = "Could not retrieve address from coordinates";
              console.error(errorMsg);
              if (onError) onError(errorMsg);
            }
          }
        );
      },
      (error) => {
        let errorMsg = "Failed to get location: " + error.message;
        console.error("Error getting location:", error);
        
        // Provide more helpful error messages
        if (error.code === error.TIMEOUT) {
          errorMsg = "Location request timed out. Please ensure WiFi is connected and try again, or manually enter your address.";
        } else if (error.code === error.PERMISSION_DENIED) {
          errorMsg = "Location permission was denied. Please allow location access and try again.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = "Location information is unavailable. Please check your device's location settings.";
        }
        
        if (onError) onError(errorMsg);
      },
      {
        enableHighAccuracy: false, // Use WiFi/IP location (better for desktop)
        timeout: 120000, // 120 seconds (2 minutes) - desktop WiFi location can be very slow
        maximumAge: 600000, // Accept cached location up to 10 minutes old
      }
    );
  }
}

export default GooglePlacesService.getInstance();

