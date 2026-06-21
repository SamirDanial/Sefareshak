import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiMapMarker, mdiOfficeBuilding, mdiLoading, mdiOpenInNew } from "@mdi/js";
import { Card, CardContent } from "@/components/ui/card";
import googlePlacesService from "@/services/googlePlacesService";
import { type Branch } from "@/services/branchService";
import { Button } from "@/components/ui/button";

interface PickupLocationDisplayProps {
  branch: Branch | null | undefined;
  className?: string;
  compact?: boolean;
}

interface AddressComponents {
  formattedAddress: string;
  addressLineOne: string;
  city: string;
  state: string;
  country: string;
  zipCode?: string;
}

const PickupLocationDisplay: React.FC<PickupLocationDisplayProps> = ({
  branch,
  className = "",
  compact = false,
}) => {
  const { t } = useTranslation();
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [detailedAddress, setDetailedAddress] = useState<AddressComponents | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  // Load Google Maps script
  useEffect(() => {
    googlePlacesService.loadScript(() => {
      setGoogleLoaded(true);
    });
  }, []);

  // Helper to parse coordinates
  const parseCoordinate = (coord: any): number | null => {
    if (coord === undefined || coord === null) return null;
    if (typeof coord === "number") return coord;
    if (typeof coord === "string") {
      const parsed = parseFloat(coord);
      return isNaN(parsed) ? null : parsed;
    }
    const parsed = parseFloat(String(coord));
    return isNaN(parsed) ? null : parsed;
  };

  // Get branch coordinates
  const branchLat = branch ? parseCoordinate(branch.latitude) : null;
  const branchLng = branch ? parseCoordinate(branch.longitude) : null;

  // Reverse geocode to get detailed address
  useEffect(() => {
    if (!googleLoaded || !branchLat || !branchLng) {
      setDetailedAddress(null);
      // Fallback to branch address if available
      if (branch?.address) {
        setDetailedAddress({
          formattedAddress: branch.address,
          addressLineOne: branch.address,
          city: branch.city || "",
          state: branch.state || "",
          country: branch.country || "",
        });
      }
      return;
    }

    setLoadingAddress(true);
    googlePlacesService.reverseGeocode(
      branchLat,
      branchLng,
      (components) => {
        setLoadingAddress(false);
        setDetailedAddress({
          formattedAddress: components.formattedAddress || "",
          addressLineOne: components.addressLineOne || "",
          city: components.city || "",
          state: components.state || "",
          country: components.country || "",
          zipCode: components.zipCode,
        });
      },
      (error) => {
        console.error("Error reverse geocoding:", error);
        setLoadingAddress(false);
        // Fallback to branch address if reverse geocoding fails
        if (branch?.address) {
          setDetailedAddress({
            formattedAddress: branch.address,
            addressLineOne: branch.address,
            city: branch.city || "",
            state: branch.state || "",
            country: branch.country || "",
          });
        } else {
          setDetailedAddress(null);
        }
      }
    );
  }, [googleLoaded, branchLat, branchLng, branch?.address, branch?.city, branch?.state, branch?.country]);

  // Initialize map
  useEffect(() => {
    if (!googleLoaded || !mapRef.current || map || !branchLat || !branchLng) return;

    const newMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: branchLat, lng: branchLng },
      zoom: 16,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    setMap(newMap);
  }, [googleLoaded, branchLat, branchLng, map]);

  // Add marker to map
  useEffect(() => {
    if (!map || !branchLat || !branchLng) return;

    // Clear existing marker
    if (markerRef.current) {
      markerRef.current.setMap(null);
    }

    try {
      const marker = new window.google.maps.Marker({
        position: { lat: branchLat, lng: branchLng },
        map: map,
        icon: {
          url: "http://maps.google.com/mapfiles/ms/icons/red.png",
          scaledSize: new window.google.maps.Size(40, 40),
          anchor: new window.google.maps.Point(20, 40),
        },
        title: branch?.name || "Pickup Location",
        animation: undefined,
      });

      markerRef.current = marker;
    } catch (error) {
      console.error("Error creating marker:", error);
    }
  }, [map, branchLat, branchLng, branch?.name]);

  // Build display address
  const displayAddress = detailedAddress
    ? detailedAddress.formattedAddress || 
      [detailedAddress.addressLineOne, detailedAddress.city, detailedAddress.state, detailedAddress.country]
        .filter(Boolean)
        .join(", ")
    : branch?.address || "";

  // Build full address with all details
  const fullAddressParts = [
    detailedAddress?.addressLineOne,
    detailedAddress?.city,
    detailedAddress?.state,
    detailedAddress?.zipCode,
    detailedAddress?.country,
  ].filter(Boolean);

  const fullAddress = fullAddressParts.length > 0
    ? fullAddressParts.join(", ")
    : displayAddress;

  // Open in Google Maps
  const openInGoogleMaps = () => {
    if (branchLat && branchLng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${branchLat},${branchLng}`;
      window.open(url, "_blank");
    }
  };

  if (!branch) {
    return null;
  }

  if (compact) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-start gap-2">
          <Icon path={mdiOfficeBuilding} size={0.67} className="mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground">
              {branch.name || t("orders.pickupLocation", { defaultValue: "Pickup Location" })}
            </div>
            {loadingAddress ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <Icon path={mdiLoading} size={0.5} className="animate-spin" />
                <span>{t("common.loading", { defaultValue: "Loading address..." })}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1 break-words">
                {displayAddress || branch.address || t("common.notAvailable", { defaultValue: "N/A" })}
              </div>
            )}
          </div>
        </div>
        {branchLat && branchLng && (
          <div className="relative w-full h-32 rounded-md overflow-hidden border border-border">
            <div ref={mapRef} className="w-full h-full" />
            {googleLoaded && (
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 z-10 bg-background/90 backdrop-blur-sm"
                onClick={openInGoogleMaps}
              >
                <Icon path={mdiOpenInNew} size={0.5} className="mr-1" />
                {t("common.openInMaps", { defaultValue: "Open in Maps" })}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon path={mdiOfficeBuilding} size={0.83} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground mb-1">
              {branch.name || t("orders.pickupLocation", { defaultValue: "Pickup Location" })}
            </h3>
            {loadingAddress ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                <span>{t("common.loading", { defaultValue: "Loading address..." })}</span>
              </div>
            ) : (
              <div className="space-y-1">
                {fullAddress && (
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <Icon path={mdiMapMarker} size={0.67} className="mt-0.5 text-muted-foreground flex-shrink-0" />
                    <span className="break-words">{fullAddress}</span>
                  </div>
                )}
                {!fullAddress && branch.address && (
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <Icon path={mdiMapMarker} size={0.67} className="mt-0.5 text-muted-foreground flex-shrink-0" />
                    <span className="break-words">{branch.address}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {branchLat && branchLng && (
          <div className="relative w-full h-64 rounded-lg overflow-hidden border border-border bg-muted">
            <div ref={mapRef} className="w-full h-full" />
            {googleLoaded && (
              <Button
                variant="outline"
                size="sm"
                className="absolute top-3 right-3 z-10 bg-background/95 backdrop-blur-sm shadow-sm hover:bg-background"
                onClick={openInGoogleMaps}
              >
                <Icon path={mdiOpenInNew} size={0.67} className="mr-2" />
                {t("common.openInMaps", { defaultValue: "Open in Google Maps" })}
              </Button>
            )}
            {!googleLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                  <span>{t("common.loading", { defaultValue: "Loading map..." })}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PickupLocationDisplay;

