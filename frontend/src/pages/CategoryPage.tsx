import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiRefresh } from "@mdi/js";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCategory } from "@/hooks/useApi";
import { useDealCategory } from "@/hooks/useApi";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useSettings } from "@/contexts/SettingsContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatPrice } from "@/utils/currency";
import { getEffectiveTimezone, getMealAvailabilityNow } from "@/utils/mealAvailability";
import { getLocalizedName, getLocalizedDescription } from "@/utils/localization";

const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";

export default function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { branch, branches } = useBranch();
  const { category, meals, loading, error } = useCategory(categoryId || "", branch?.id);
  const {
    category: dealCategory,
    deals,
    loading: dealLoading,
    error: dealError,
  } = useDealCategory(categoryId || "", branch?.id);
  const { currency, settings } = useSettings();

  const selectedBranch = useMemo(() => {
    if (!branch?.id) return null;
    return branches.find((b) => b.id === branch.id) ?? null;
  }, [branch?.id, branches]);

  const effectiveTimezone = useMemo(() => {
    return getEffectiveTimezone({
      branchTimezone: (selectedBranch as any)?.timezone ?? null,
      settingsTimezone: (settings as any)?.timezone ?? null,
    });
  }, [selectedBranch, settings]);

  const orderedDeals = useMemo(() => {
    if (!deals) return [];
    return [...deals].sort((a: any, b: any) => {
      const orderA =
        typeof (a as any).listOrder === "number" && (a as any).listOrder > 0
          ? (a as any).listOrder
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof (b as any).listOrder === "number" && (b as any).listOrder > 0
          ? (b as any).listOrder
          : Number.MAX_SAFE_INTEGER;

      if (orderA === orderB) {
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      }
      return orderA - orderB;
    });
  }, [deals]);

  const getDealTotal = (deal: any): number => {
    const components = Array.isArray(deal?.components) ? deal.components : [];
    return components.reduce((sum: number, c: any) => {
      const v = c?.effectivePrice ?? c?.price;
      const n = typeof v === "number" ? v : parseFloat(String(v || 0));
      const q = c?.quantity !== undefined && c?.quantity !== null ? Number(c.quantity) : 1;
      const qty = Number.isFinite(q) && q > 0 ? q : 1;
      return sum + (isNaN(n) ? 0 : n) * qty;
    }, 0);
  };

  const shouldRenderDeals = Boolean(
    dealCategory &&
      (orderedDeals.length > 0 || Number((dealCategory as any)?._count?.deals || 0) > 0)
  );

  // Filter meals based on selected branch
  // Exclude meal if:
  // 1. Branch is in meal.excludedBranches, OR
  // 2. Branch is in meal.category.excludedBranches
  const filteredMeals = useMemo(() => {
    if (!meals) return [];
    if (!branch?.id) return meals;
    
    return meals.filter((meal) => {
      // Check if meal is excluded from this branch
      const mealExcludedBranches = (meal as any).excludedBranches || [];
      if (mealExcludedBranches.includes(branch.id)) {
        return false;
      }
      // Check if meal's category is excluded from this branch
      const categoryExcludedBranches = (meal.category as any)?.excludedBranches || [];
      if (categoryExcludedBranches.includes(branch.id)) {
        return false;
      }
      return true;
    });
  }, [meals, branch?.id]);

  const orderedMeals = useMemo(() => {
    if (!filteredMeals) return [];
    return [...filteredMeals].sort((a, b) => {
      const orderA =
        typeof (a as any).listOrder === "number" && (a as any).listOrder! > 0
          ? (a as any).listOrder!
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof (b as any).listOrder === "number" && (b as any).listOrder! > 0
          ? (b as any).listOrder!
          : Number.MAX_SAFE_INTEGER;

      if (orderA === orderB) {
        return a.name.localeCompare(b.name);
      }
      return orderA - orderB;
    });
  }, [filteredMeals]);

  if (dealLoading) {
    return (
      <section className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home")}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              Loading category...
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Loading Category
            </h3>
            <p className="text-sm text-muted-foreground">
              Fetching category meals and information...
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (shouldRenderDeals) {
    if (dealError || !dealCategory) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Category not found</h2>
            <p className="text-red-500 mb-4">{dealError}</p>
            <Link to="/" className="text-pink-500 hover:text-pink-600">
              Back to Home
            </Link>
          </div>
        </div>
      );
    }

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home")}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
            {getLocalizedName(dealCategory.name, dealCategory.nameFa, i18n.language)}
          </h1>
        </div>

        {getLocalizedDescription(dealCategory.description, dealCategory.descriptionFa, i18n.language) && (
          <Card className="bg-[#1a1a1a] border-[#262626]">
            <CardContent className="p-4">
              <p className="text-sm text-[#9CA3AF] leading-relaxed whitespace-pre-wrap line-clamp-2">
                {getLocalizedDescription(dealCategory.description, dealCategory.descriptionFa, i18n.language)}
              </p>
            </CardContent>
          </Card>
        )}

        {orderedDeals.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t("home.noDealsInCategory")}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {orderedDeals.map((deal: any) => (
              <Card key={deal.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex">
                    <div className="w-32 h-32">
                      <img
                        src={
                          deal.image
                            ? isExternalImage(deal.image)
                              ? deal.image
                              : getOptimizedImageUrl(deal.image)
                            : FALLBACK_IMG
                        }
                        alt={getLocalizedName(deal.name, deal.nameFa, i18n.language)}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                          (e.currentTarget as HTMLImageElement).onerror = null;
                        }}
                      />
                    </div>
                    <div className="flex-1 p-4 space-y-2">
                      <h3 className="font-semibold">{getLocalizedName(deal.name, deal.nameFa, i18n.language)}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {getLocalizedDescription(deal.description, deal.descriptionFa, i18n.language)}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold">
                          {formatPrice(getDealTotal(deal), currency || "EUR")}
                        </span>
                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 hover:scale-[1.02] hover:shadow-rose-500/50"
                          onClick={() => navigate(`/deal/${encodeURIComponent(deal.id)}`)}
                        >
                          {t("home.feedMe")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (loading) {
    return (
      <section className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home")}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              Loading category...
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.0} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Loading Category
            </h3>
            <p className="text-sm text-muted-foreground">
              Fetching category meals and information...
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !category) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Category not found</h2>
          <p className="text-red-500 mb-4">{error}</p>
          <Link to="/" className="text-pink-500 hover:text-pink-600">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/home")}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
        >
          <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
          {getLocalizedName(category.name, category.nameFa, i18n.language)}
        </h1>
      </div>

      {getLocalizedDescription(category.description, category.descriptionFa, i18n.language) && (
        <Card className="bg-[#1a1a1a] border-[#262626]">
          <CardContent className="p-4">
            <p className="text-sm text-[#9CA3AF] leading-relaxed whitespace-pre-wrap line-clamp-2">
              {getLocalizedDescription(category.description, category.descriptionFa, i18n.language)}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {orderedMeals.map((meal) => (
          <Link key={meal.id} to={`/meal/${meal.id}?from=category&categoryId=${encodeURIComponent(category.id)}`}>
            <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="flex">
                  <div className="w-32 h-32">
                    {(() => {
                      const availability = getMealAvailabilityNow({
                        meal,
                        branchId: branch?.id,
                        tz: effectiveTimezone,
                      });
                      const isAvailableNow = availability.isAvailableNow;

                      return (
                        <img
                          src={
                            meal.image
                              ? isExternalImage(meal.image)
                                ? meal.image
                                : getOptimizedImageUrl(meal.image)
                              : FALLBACK_IMG
                          }
                          alt={getLocalizedName(meal.name, meal.nameFa, i18n.language)}
                          className="h-full w-full object-cover"
                          style={!isAvailableNow ? { filter: "grayscale(1)", opacity: 0.85 } : undefined}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                            (e.currentTarget as HTMLImageElement).onerror = null;
                          }}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0 p-4 space-y-2">
                    <h3 className="font-semibold">{getLocalizedName(meal.name, meal.nameFa, i18n.language)}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {getLocalizedDescription(meal.description, meal.descriptionFa, i18n.language)}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold">
                        {formatPrice(meal.effectiveBasePrice ?? parseFloat(meal.basePrice), currency)}
                      </span>
                      <Button
                        size="sm"
                        className="bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 hover:scale-[1.02] hover:shadow-rose-500/50"
                      >
                        {t("home.feedMe")}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
