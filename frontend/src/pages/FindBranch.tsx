import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBranch } from "@/contexts/BranchContext";
import  { type Branch } from "@/services/branchService";
import googlePlacesService from "@/services/googlePlacesService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiMapMarker, mdiNavigation, mdiCheckCircle, mdiCloseCircle, mdiLoading, mdiStore, mdiAlertCircle, mdiChevronDown, mdiChevronUp, mdiMagnify } from "@mdi/js";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Declare Google Maps types
declare global {
  namespace google {
    namespace maps {
      class Map {
        constructor(element: HTMLElement | null, options?: any);
        setCenter(location: { lat: number; lng: number }): void;
        panTo(location: { lat: number; lng: number }): void;
        setZoom(zoom: number): void;
        fitBounds(bounds: LatLngBounds): void;
      }
      class Marker {
        constructor(options?: any);
        setMap(map: Map | null): void;
        addListener(event: string, handler: () => void): void;
      }
      class Circle {
        constructor(options?: any);
        setMap(map: Map | null): void;
      }
      class LatLngBounds {
        constructor();
        extend(location: { lat: number; lng: number }): void;
      }
      namespace places {
        class Autocomplete {
          constructor(input: HTMLInputElement, options?: any);
          addListener(event: string, handler: () => void): void;
          getPlace(): any;
        }
      }
      namespace Animation {
        const BOUNCE: any;
      }
      class Size {
        constructor(width: number, height: number);
      }
      class Point {
        constructor(x: number, y: number);
      }
    }
  }
}

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

const FindBranch: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { branches, loadingBranches, setBranch, refreshBranches } = useBranch();

  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null); // Use ref to avoid stale closures
  const mapMarkersRef = useRef<google.maps.Marker[]>([]);
  const mapCirclesRef = useRef<google.maps.Circle[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

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
  const [branchesWithDistance, setBranchesWithDistance] = useState<
    BranchWithDistance[]
  >([]);
  const [, setNearestBranch] = useState<BranchWithDistance | null>(
    null
  );
  const [showList, setShowList] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const hasAutoLocatedRef = useRef(false);

  // Load Google Maps script
  useEffect(() => {
    googlePlacesService.loadScript(() => {
      setGoogleLoaded(true);
    });
  }, []);

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

  // Initialize map when Google is loaded
  useEffect(() => {
    if (!googleLoaded || !mapRef.current || map) return;

    const defaultCenter = { lat: 25.276987, lng: 55.296249 }; // Default to Dubai (fallback)

    const newMap = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    setMap(newMap);
    mapInstanceRef.current = newMap; // Also store in ref for reliable access
  }, [googleLoaded, map]);

  // Update map markers and delivery radius circles
  const updateMapMarkers = useCallback(
    (
      branchesWithDist: BranchWithDistance[],
      userLat: number,
      userLng: number,
      nearestBranchId: string | null,
      shouldFitBounds: boolean = true
    ) => {
      // Use ref to get the most current map instance (avoids stale closures)
      const currentMap = mapInstanceRef.current || map;
      if (!currentMap) {
        return;
      }

      // Clear existing markers and circles
      mapMarkersRef.current.forEach((marker) => marker.setMap(null));
      mapCirclesRef.current.forEach((circle) => circle.setMap(null));
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);

      const newMarkers: google.maps.Marker[] = [];
      const newCircles: google.maps.Circle[] = [];

      // Add user location marker (green pin) - always show this
      try {
        const newUserMarker = new window.google.maps.Marker({
          position: { lat: userLat, lng: userLng },
          map: currentMap,
          icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/green.png",
            scaledSize: new window.google.maps.Size(40, 40),
            anchor: new window.google.maps.Point(20, 40),
          },
          title: "Your Location / Searched Address",
          zIndex: 1000,
          visible: true,
        });
        userMarkerRef.current = newUserMarker;
      } catch (error) {
        console.error("Error creating user location marker:", error);
      }

      // Add branch markers and delivery radius circles
      branchesWithDist.forEach((branch) => {
        // Parse coordinates (handle string, number, or Decimal types)
        const branchLat = parseCoordinate(branch.latitude);
        const branchLng = parseCoordinate(branch.longitude);

        if (branchLat === null || branchLng === null) {
          console.warn(`Branch ${branch.name || branch.id} missing valid coordinates`);
          return;
        }

        try {
          // Create marker (red pin for restaurant/branch)
          const marker = new window.google.maps.Marker({
            position: {
              lat: branchLat,
              lng: branchLng,
            },
            map: currentMap,
            icon: {
              url: "http://maps.google.com/mapfiles/ms/icons/red.png",
              scaledSize: new window.google.maps.Size(40, 40),
              anchor: new window.google.maps.Point(20, 40),
            },
            title: `${branch.name || "Branch"} - ${
              branch.deliveryAvailable ? "Delivery Available" : "Delivery Not Available"
            }`,
            animation: branch.id === nearestBranchId ? window.google.maps.Animation.BOUNCE : undefined,
            visible: true,
          });

          // Add click listener
          marker.addListener("click", () => {
            setSelectedBranchId(branch.id);
            currentMap.setCenter({
              lat: branchLat,
              lng: branchLng,
            });
            currentMap.setZoom(14);
          });

          newMarkers.push(marker);
        } catch (error) {
          console.error(`Error creating marker for branch ${branch.id}:`, error);
        }

        // Create delivery radius circle
        if (
          branch.deliveryRadius !== null &&
          branch.deliveryRadius !== undefined
        ) {
          const circle = new window.google.maps.Circle({
            strokeColor: branch.deliveryAvailable ? "#22c55e" : "#ef4444",
            strokeOpacity: 0.6,
            strokeWeight: 2,
            fillColor: branch.deliveryAvailable ? "#22c55e" : "#ef4444",
            fillOpacity: 0.15,
            map: currentMap,
            center: {
              lat: branchLat,
              lng: branchLng,
            },
            radius: branch.deliveryRadius * 1000, // Convert km to meters
          });
          newCircles.push(circle);
        }
      });

      mapMarkersRef.current = newMarkers;
      mapCirclesRef.current = newCircles;

      // Only fit bounds if requested (not when user just selected an address)
      if (shouldFitBounds && branchesWithDist.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend({ lat: userLat, lng: userLng });
        branchesWithDist.forEach((branch) => {
          const branchLat = parseCoordinate(branch.latitude);
          const branchLng = parseCoordinate(branch.longitude);
          if (branchLat !== null && branchLng !== null) {
            bounds.extend({
              lat: branchLat,
              lng: branchLng,
            });
          }
        });
        currentMap.fitBounds(bounds);
      }
    },
    [map, parseCoordinate]
  );

  // Calculate distances and check delivery availability
  const calculateDistancesAndCheckDelivery = useCallback(
    async (lat: number, lng: number, skipFitBounds: boolean = false) => {
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

      // Update map markers and circles
      // skipFitBounds is true when address is selected, so we keep the center
      // Always update markers regardless of skipFitBounds - that only affects fitBounds
      // Ensure we have a valid map instance and branches before updating markers
      const updateMarkers = () => {
        const currentMapInstance = mapInstanceRef.current || map;
        if (currentMapInstance) {
          // Filter out branches without valid coordinates
          const validBranches = branchesWithDist.filter(
            (b) => b.latitude && b.longitude
          );
          if (validBranches.length > 0 || branchesWithDist.length === 0) {
            // Update markers even if no valid branches (to show user location)
            updateMapMarkers(
              validBranches.length > 0 ? validBranches : branchesWithDist,
              lat,
              lng,
              nearest?.id || null,
              !skipFitBounds
            );
          }
        } else {
          // If map not ready, wait a bit and retry (max 2 seconds)
          setTimeout(updateMarkers, 100);
        }
      };
      
      // Use a small delay to ensure map is ready and state has updated
      setTimeout(updateMarkers, 150);
    },
    [branches, updateMapMarkers]
  );

  // Initialize address autocomplete
  useEffect(() => {
    if (!googleLoaded || !addressInputRef.current || autocompleteRef.current)
      return;

    const autocomplete = new window.google.maps.places.Autocomplete(
      addressInputRef.current,
      {
        types: ["geocode", "establishment"], // Include both addresses and places for better results
        fields: ["address_components", "geometry", "formatted_address", "name"],
      }
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) {
        toast.error("No address details available");
        return;
      }

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      // Use the description from the input field (what user clicked/typed) - like checkout page
      // Get the current value from the input field which contains what the user selected
      const address = addressInputRef.current?.value || place.formatted_address || place.name || "";

      // Update state
      setSelectedAddress(address);
      setSelectedAddressCoords({ latitude: lat, longitude: lng });
      setUserLocation(null); // Clear user location when address is selected
      setLocationError(null);

      // Get current map instance from state
      const currentMap = map;
      
      // Function to center map on selected address
      const centerMapOnAddress = () => {
        if (currentMap) {
          currentMap.setCenter({ lat, lng });
          currentMap.setZoom(13);
          return true;
        }
        return false;
      };
      
      // Try to center immediately
      if (!centerMapOnAddress()) {
        // If map not ready, wait for it with retries
        let retries = 0;
        const maxRetries = 20; // 2 seconds max wait
        const checkMapInterval = setInterval(() => {
          retries++;
          const mapInstance = map; // Get fresh map reference
          if (mapInstance) {
            clearInterval(checkMapInterval);
            mapInstance.setCenter({ lat, lng });
            mapInstance.setZoom(13);
            // Now calculate distances and update markers
            // Pass true to skip fitBounds so the selected address stays centered
            calculateDistancesAndCheckDelivery(lat, lng, true);
          } else if (retries >= maxRetries) {
            clearInterval(checkMapInterval);
            console.error("Map not available after waiting");
          }
        }, 100);
      } else {
        // Map is ready, center it and calculate distances
        // Use a small delay to ensure map has centered before updating markers
        // Pass true to skip fitBounds so the selected address stays centered
        setTimeout(() => {
          calculateDistancesAndCheckDelivery(lat, lng, true);
        }, 200);
      }
    });

    autocompleteRef.current = autocomplete;
  }, [googleLoaded, map, calculateDistancesAndCheckDelivery]);

  // Automatically get user location on page load
  useEffect(() => {
    if (!map || hasAutoLocatedRef.current) return;

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      // Silently fall back to default location if geolocation is not supported
      return;
    }

    hasAutoLocatedRef.current = true;
    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setUserLocation({ latitude: lat, longitude: lng });
        setIsGettingLocation(false);

        // Calculate zoom level based on delivery radius (same as mobile app)
        let targetZoom = 12; // Default zoom
        if (branches.length > 0) {
          // Find the maximum delivery radius
          const maxRadius = Math.max(...branches.map(b => {
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

        // Center map on user location with calculated zoom
        if (map) {
          map.setCenter({ lat, lng });
          map.setZoom(targetZoom);
        }

        // Reverse geocode to get address
        googlePlacesService.reverseGeocode(lat, lng, (components) => {
          setSelectedAddress(components.formattedAddress || "");
        });

        // Calculate distances and check delivery - skip fitBounds to preserve zoom
        calculateDistancesAndCheckDelivery(lat, lng, true);
      },
      (_error) => {
        // Silently fall back to default location on initial load
        // Only show errors if user manually clicks "Use My Location"
        setIsGettingLocation(false);
        // Don't set locationError or show toast on auto-location failure
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [map, calculateDistancesAndCheckDelivery]);

  // Search for typed address
  const handleSearchAddress = () => {
    if (!selectedAddress || selectedAddress.trim() === "") {
      toast.error("Please enter an address to search");
      return;
    }

    if (!googleLoaded || !map) {
      toast.error("Map is not ready. Please wait a moment and try again.");
      return;
    }

    setIsSearchingAddress(true);
    setLocationError(null);
    setUserLocation(null); // Clear user location when searching address

    // Use Google Geocoder to geocode the address
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { address: selectedAddress },
      (results: any[] | null, status: string) => {
        setIsSearchingAddress(false);
        
        if (status === window.google.maps.GeocoderStatus.OK && results && results.length > 0) {
          const result = results[0];
          const lat = result.geometry.location.lat();
          const lng = result.geometry.location.lng();
          // Keep the address as what user typed/selected (like checkout page)
          // Don't update with formattedAddress - user wants to see what they entered

          // Update state - keep selectedAddress as is (what user typed)
          setSelectedAddressCoords({ latitude: lat, longitude: lng });

          // Center map on found address
          if (map) {
            map.setCenter({ lat, lng });
            map.setZoom(13);
          }

          // Calculate distances and update markers
          // Wait a bit to ensure map has centered, then update markers
          setTimeout(() => {
            if (branches.length > 0) {
              calculateDistancesAndCheckDelivery(lat, lng, true);
            } else {
              // If branches aren't loaded yet, wait for them
              const checkBranches = setInterval(() => {
                if (branches.length > 0) {
                  clearInterval(checkBranches);
                  calculateDistancesAndCheckDelivery(lat, lng, true);
                }
              }, 100);
              // Stop checking after 5 seconds
              setTimeout(() => clearInterval(checkBranches), 5000);
            }
          }, 300);

          toast.success("Address found!");
        } else {
          const errorMsg = 
            status === window.google.maps.GeocoderStatus.ZERO_RESULTS
              ? "No results found for this address. Please try a different address."
              : "Failed to find the address. Please try again.";
          setLocationError(errorMsg);
          toast.error(errorMsg);
        }
      }
    );
  };

  // Get user's current location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(
        t("findBranch.geolocationNotSupported") ||
          "Geolocation is not supported by your browser"
      );
      return;
    }

    setIsGettingLocation(true);
    setLocationError(null);
    setSelectedAddress("");
    setSelectedAddressCoords(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setUserLocation({ latitude: lat, longitude: lng });
        setIsGettingLocation(false);

        // Calculate zoom level based on delivery radius (same as mobile app)
        let targetZoom = 12; // Default zoom
        if (branches.length > 0) {
          // Find the maximum delivery radius
          const maxRadius = Math.max(...branches.map(b => {
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

        // Center map on user location with calculated zoom
        if (map) {
          map.setCenter({ lat, lng });
          map.setZoom(targetZoom);
        }

        // Reverse geocode to get address
        googlePlacesService.reverseGeocode(lat, lng, (components) => {
          setSelectedAddress(components.formattedAddress || "");
        });

        // Calculate distances and check delivery - skip fitBounds to preserve zoom
        calculateDistancesAndCheckDelivery(lat, lng, true);
      },
      (error) => {
        setIsGettingLocation(false);
        let errorMessage = "";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage =
              t("findBranch.locationPermissionDenied") ||
              "Location permission denied. Please enable location access in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage =
              t("findBranch.locationUnavailable") ||
              "Location information is unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage =
              t("findBranch.locationTimeout") ||
              "Location request timed out. Please try again.";
            break;
          default:
            errorMessage =
              t("findBranch.locationError") ||
              "An unknown error occurred while getting your location.";
            break;
        }
        setLocationError(errorMessage);
        toast.error(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Handle branch selection
  const handleSelectBranch = (branch: BranchWithDistance) => {
    setBranch({
      id: branch.id,
      name: branch.name || null,
      distanceKm: branch.distance || null,
    }, "MANUAL");
    setSelectedBranchId(branch.id);
    toast.success(
      t("findBranch.branchSelected") ||
        `Selected ${branch.name || "branch"} successfully!`
    );
    navigate("/");
  };

  // Refresh branches when component mounts
  useEffect(() => {
    refreshBranches();
  }, [refreshBranches]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-6 max-w-screen-2xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 shadow-lg shadow-pink-500/30">
              <Icon path={mdiMapMarker} size={1.00} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {t("findBranch.title") || "Find a Branch"}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("findBranch.description") ||
                  "Search for branches near you and check delivery availability"}
              </p>
            </div>
          </div>
        </div>

        {/* Search Section */}
        <Card className="mb-6 bg-card border-border shadow-lg">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="w-full relative">
                  <Icon path={mdiMagnify} size={0.83} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={addressInputRef}
                    type="text"
                    placeholder={
                      t("findBranch.addressPlaceholder") ||
                      "Enter an address or location..."
                    }
                    value={selectedAddress}
                    onChange={(e) => setSelectedAddress(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSearchAddress();
                      }
                    }}
                    className="bg-background text-foreground border-border pl-10 h-12 text-base w-full"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    onClick={handleSearchAddress}
                    disabled={isSearchingAddress || !selectedAddress.trim()}
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/30 h-12 px-4 sm:px-6"
                  >
                    {isSearchingAddress ? (
                      <>
                        <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                        <span className="hidden sm:inline">
                          {t("findBranch.searching", { defaultValue: "Searching..." })}
                        </span>
                        <span className="sm:hidden">Searching...</span>
                      </>
                    ) : (
                      <>
                        <Icon path={mdiMagnify} size={0.67} className="mr-2" />
                        <span className="hidden sm:inline">
                          {t("findBranch.searchAddress", { defaultValue: "Search Address" })}
                        </span>
                        <span className="sm:hidden">Search</span>
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleGetCurrentLocation}
                    disabled={isGettingLocation}
                    className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg shadow-pink-500/30 h-12 px-4 sm:px-6"
                  >
                    {isGettingLocation ? (
                      <>
                        <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                        <span className="hidden sm:inline">
                          {t("findBranch.gettingLocation") || "Getting Location..."}
                        </span>
                        <span className="sm:hidden">Getting...</span>
                      </>
                    ) : (
                      <>
                        <Icon path={mdiNavigation} size={0.67} className="mr-2" />
                        <span className="hidden sm:inline">
                          {t("findBranch.useMyLocation") || "Use My Location"}
                        </span>
                        <span className="sm:hidden">My Location</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {locationError && (
                <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <Icon path={mdiAlertCircle} size={0.83} className="text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-500">{locationError}</p>
                </div>
              )}

              {(userLocation || selectedAddressCoords) && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <Icon path={mdiMapMarker} size={0.83} className="text-green-500 flex-shrink-0" />
                  <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                    {selectedAddress ||
                      `${userLocation?.latitude.toFixed(4)}, ${userLocation?.longitude.toFixed(4)}`}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map Section - Full width on all screen sizes */}
      <div className="container mx-auto px-4 max-w-screen-2xl">
        {/* Map */}
        <div className="w-full mb-6">
          <Card className="bg-card border-border rounded-xl w-full shadow-xl overflow-hidden">
            <CardHeader className="px-4 lg:px-6 py-4 bg-gradient-to-r from-pink-500/10 to-rose-500/10 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500">
                  <Icon path={mdiMapMarker} size={0.67} className="text-white" />
                </div>
                <CardTitle className="text-lg font-semibold">
                  {t("findBranch.mapTitle") || "Map View"}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div
                ref={mapRef}
                className="w-full h-[600px] rounded-b-xl border-0"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Branch List Section */}
      <div className="container mx-auto px-4 py-6 max-w-screen-2xl">
        <div className="w-full">
            <Card className="bg-card border-border sticky top-6 shadow-xl rounded-xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-pink-500/10 to-rose-500/10 border-b border-border py-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500">
                    <Icon path={mdiStore} size={0.67} className="text-white" />
                  </div>
                  <CardTitle className="text-lg font-semibold">
                    {t("findBranch.branchesTitle") || "Branches"}
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowList(!showList)}
                  className="lg:hidden hover:bg-pink-500/10"
                >
                  {showList ? (
                    <Icon path={mdiChevronDown} size={0.67} />
                  ) : (
                    <Icon path={mdiChevronUp} size={0.67} />
                  )}
                </Button>
              </CardHeader>
              <CardContent
                className={cn(
                  "space-y-4 max-h-[600px] overflow-y-auto p-4",
                  !showList && "hidden lg:block"
                )}
              >
                {loadingBranches ? (
                  <div className="flex items-center justify-center py-8">
                    <Icon path={mdiLoading} size={1.00} className="animate-spin text-pink-500" />
                  </div>
                ) : branchesWithDistance.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="p-4 rounded-full bg-muted/50 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <Icon path={mdiStore} size={1.33} className="opacity-50" />
                    </div>
                    <p className="text-sm">
                      {userLocation || selectedAddressCoords
                        ? t("findBranch.noBranchesFound") ||
                          "No branches found near this location"
                        : t("findBranch.searchOrUseLocation") ||
                          "Enter an address or use your location to find branches"}
                    </p>
                  </div>
                ) : (
                  branchesWithDistance.map((branch) => {
                    if (!branch.latitude || !branch.longitude) return null;

                    return (
                      <Card
                        key={branch.id}
                        className={cn(
                          "border-2 transition-all cursor-pointer hover:shadow-lg hover:scale-[1.02] rounded-xl overflow-hidden",
                          selectedBranchId === branch.id
                            ? "border-pink-500 bg-gradient-to-br from-pink-500/10 to-rose-500/10 shadow-lg shadow-pink-500/20"
                            : "border-border hover:border-pink-500/50 bg-card",
                          branch.deliveryAvailable
                            ? "ring-2 ring-green-500/20"
                            : "ring-2 ring-red-500/20"
                        )}
                        onClick={() => {
                          setSelectedBranchId(branch.id);
                          if (map && branch.latitude && branch.longitude) {
                            map.setCenter({
                              lat: branch.latitude,
                              lng: branch.longitude,
                            });
                            map.setZoom(14);
                          }
                        }}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500">
                                  <Icon path={mdiStore} size={0.50} className="text-white" />
                                </div>
                                <h3 className="font-bold text-foreground text-base">
                                  {branch.name || `Branch ${branch.id.slice(0, 8)}`}
                                </h3>
                              </div>
                              {branch.address && (
                                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                  {branch.address}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 ml-2">
                              {branch.deliveryAvailable ? (
                                <div className="p-2 rounded-full bg-green-500/20">
                                  <Icon path={mdiCheckCircle} size={0.83} className="text-green-500" />
                                </div>
                              ) : (
                                <div className="p-2 rounded-full bg-red-500/20">
                                  <Icon path={mdiCloseCircle} size={0.83} className="text-red-500" />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 mb-4">
                            {branch.distance !== undefined && (
                              <Badge
                                variant="outline"
                                className="text-xs border-pink-500/50 text-pink-500 bg-pink-500/10 font-semibold"
                              >
                                <Icon path={mdiMapMarker} size={0.50} className="mr-1" />
                                {branch.distance.toFixed(2)} km
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs font-semibold",
                                branch.deliveryAvailable
                                  ? "border-green-500/50 text-green-500 bg-green-500/10"
                                  : "border-red-500/50 text-red-500 bg-red-500/10"
                              )}
                            >
                              {branch.deliveryAvailable
                                ? t("findBranch.deliveryAvailable") ||
                                  "Delivery Available"
                                : t("findBranch.deliveryNotAvailable") ||
                                  "Delivery Not Available"}
                            </Badge>
                            {branch.deliveryRadius !== null &&
                              branch.deliveryRadius !== undefined && (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-gray-500/50 text-gray-500 bg-gray-500/10"
                                >
                                  {t("findBranch.radius") || "Radius"}:{" "}
                                  {branch.deliveryRadius} km
                                </Badge>
                              )}
                          </div>

                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectBranch(branch);
                            }}
                            className={cn(
                              "w-full text-white font-semibold shadow-lg transition-all hover:scale-105",
                              selectedBranchId === branch.id
                                ? "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700"
                                : "bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600"
                            )}
                            size="sm"
                          >
                            {t("findBranch.selectBranch") || "Select Branch"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
};

export default FindBranch;

