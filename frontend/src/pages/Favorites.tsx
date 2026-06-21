import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBranch } from "@/contexts/BranchContext";
import { useCartStore } from "@/store/cartStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiHeart, mdiStore, mdiArrowRight } from "@mdi/js";
import { getOptimizedImageUrl } from "@/utils/imageUtils";
import branchService from "@/services/branchService";

export default function Favorites() {
  const { isSignedIn, getToken } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setBranch, branch } = useBranch();
  const { clearCart } = useCartStore();

  const [likedBranchIds, setLikedBranchIds] = useState<string[]>([]);
  const [favoriteBranches, setFavoriteBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch liked branch IDs
  const fetchLikedBranches = async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await branchService.getLikedBranches(token);
      if (res && res.success && Array.isArray(res.data)) {
        const ids = res.data.map((b: any) => b.id);
        setLikedBranchIds(ids);
      } else {
        console.error("[Favorites] Invalid API response format:", res);
      }
    } catch (err) {
      console.error("[Favorites] Error fetching liked branches:", err);
      setError(t("favorites.error", { defaultValue: "Failed to load favorites" }));
    }
  };

  // Fetch full branch details for liked branches
  const fetchFavoriteBranchDetails = async () => {
    if (likedBranchIds.length === 0) {
      setFavoriteBranches([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch all branches WITHOUT token to get all branches from all organizations
      // This is a customer-facing feature, so we need to see all branches regardless of staff permissions
      const allBranches = await branchService.getBranches(undefined);
      if (allBranches && Array.isArray(allBranches)) {
        const favorites = allBranches.filter((b: any) => likedBranchIds.includes(b.id));
        setFavoriteBranches(favorites);
      } else {
        console.error("[Favorites] Invalid branches response:", allBranches);
      }
    } catch (err) {
      console.error("[Favorites] Error fetching branch details:", err);
      setError(t("favorites.error", { defaultValue: "Failed to load favorites" }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetchLikedBranches();
  }, [isSignedIn]);

  useEffect(() => {
    if (likedBranchIds.length > 0) {
      fetchFavoriteBranchDetails();
    } else {
      setLoading(false);
    }
  }, [likedBranchIds]);

  const handleBranchClick = (branchData: any) => {
    if (!branchData?.id) return;

    // Clear cart when switching branches
    clearCart();

    // Store the complete branch data in sessionStorage for the Menu page to use
    // This ensures the branch is available even if it's filtered out by location
    try {
      sessionStorage.setItem("selectedBranchId", branchData.id);
      sessionStorage.setItem("selectedBranchData", JSON.stringify(branchData));
      sessionStorage.setItem("skipAutoBranchSelect", "true"); // Prevent BranchContext auto-selection
    } catch (e) {
      console.error("[Favorites] Failed to store selected branch data:", e);
    }

    // Set the selected branch with full data to ensure correct selection
    setBranch(
      { id: branchData.id, name: branchData.name || null, distanceKm: null },
      "MANUAL"
    );

    // Navigate to menu immediately with query parameter to indicate favorites flow
    navigate("/menu?fromFavorites=true");
  };

  const handleBrowseBranches = () => {
    navigate("/scope");
  };

  const placeholderImageForBranch = (name: string | null | undefined) => {
    const label = (name || "Branch").trim() || "Branch";
    const letter = label[0]?.toUpperCase() || "B";
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ec4899"/>
      <stop offset="50%" stop-color="#f43f5e"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" rx="36" fill="url(#g)"/>
  <circle cx="660" cy="110" r="120" fill="rgba(255,255,255,0.12)"/>
  <circle cx="150" cy="340" r="160" fill="rgba(0,0,0,0.14)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" font-size="170" font-weight="800" fill="rgba(255,255,255,0.92)">${letter}</text>
</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };

  const branchImageUrl = (b: any): string => {
    const raw = b?.branchImage;
    if (typeof raw === "string" && raw.trim()) {
      return getOptimizedImageUrl(raw.trim(), "medium");
    }
    return placeholderImageForBranch(b?.name);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 py-16">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-pink-500/20 animate-ping" />
          <div className="relative rounded-full bg-pink-500/10 p-6">
            <Icon path={mdiHeart} size={3} className="text-pink-500 animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-white font-medium">
            {t("favorites.loading.title", { defaultValue: "Loading favorites..." })}
          </p>
          <p className="text-sm text-gray-400">
            {t("favorites.loading.subtitle", { defaultValue: "Fetching your favorite branches" })}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-16">
        <Icon path={mdiHeart} size={2} className="text-gray-400" />
        <p className="text-gray-400">{error}</p>
        <Button onClick={fetchLikedBranches} variant="outline">
          {t("common.refresh", { defaultValue: "Refresh" })}
        </Button>
      </div>
    );
  }

  if (favoriteBranches.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 py-16 px-4">
        <div className="rounded-full bg-pink-500/10 p-6">
          <Icon path={mdiHeart} size={3} className="text-pink-500" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-white">
            {t("favorites.empty.title", { defaultValue: "No favorites yet" })}
          </h2>
          <p className="text-gray-400">
            {t("favorites.empty.description", { defaultValue: "Start liking branches to see them here!" })}
          </p>
        </div>
        <Button onClick={handleBrowseBranches} className="bg-pink-500 hover:bg-pink-600">
          {t("favorites.empty.cta", { defaultValue: "Browse Branches" })}
          <Icon path={mdiArrowRight} size={0.67} className="ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-pink-500/10 p-2">
          <Icon path={mdiHeart} size={1} className="text-pink-500" />
        </div>
        <h1 className="text-2xl font-bold text-white">
          {t("favorites.title", { defaultValue: "My Favorite Branches" })}
        </h1>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {favoriteBranches.map((branchData) => {
          const isSelected = branch?.id && branchData.id === branch.id;
          const organizationName = branchData?.organization?.name || branchData?.organization?.settings?.businessName;

          return (
            <Card
              key={branchData.id}
              className={`overflow-hidden cursor-pointer transition-all hover:scale-[1.02] ${
                isSelected
                  ? "border-pink-500/70 ring-1 ring-pink-500/30 bg-[#171717]"
                  : "bg-[#171717] border-[#2a2a2a] hover:bg-[#1f1f1f]"
              }`}
              onClick={() => handleBranchClick(branchData)}
            >
              <div className="relative aspect-video">
                <img
                  src={branchImageUrl(branchData)}
                  alt={branchData.name || "Branch"}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 backdrop-blur">
                  <Icon path={mdiHeart} size={0.67} className="text-pink-500 fill-pink-500" />
                </div>
              </div>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{branchData.name}</h3>
                    {organizationName && (
                      <p className="text-xs text-gray-400 truncate">{organizationName}</p>
                    )}
                  </div>
                  <Icon path={mdiStore} size={0.67} className="text-pink-500 shrink-0" />
                </div>
                {isSelected && (
                  <div className="flex items-center gap-1 text-xs text-pink-400">
                    <Icon path={mdiArrowRight} size={0.5} />
                    <span>{t("common.selected", { defaultValue: "Selected" })}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
