import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiRefresh, mdiTag } from "@mdi/js";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDealCategory } from "@/hooks/useApi";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useSettings } from "@/contexts/SettingsContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatPrice } from "@/utils/currency";

const FALLBACK_IMG = "https://placehold.co/800x800?text=Deals";

export default function DealCategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { branch } = useBranch();
  const { category, deals, loading, error } = useDealCategory(categoryId || "", branch?.id);
  const { currency } = useSettings();

  const orderedDeals = useMemo(() => {
    if (!deals) return [];
    return [...deals].sort((a, b) => {
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

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home")}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">{t("home.loading")}</span>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.0} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">{t("home.loading")}</h3>
            <p className="text-sm text-muted-foreground">{t("home.loadingDealCategory")}</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !category) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">{t("home.dealCategoryNotFound")}</h2>
          <p className="text-red-500 mb-4">{error}</p>
          <Link to="/" className="text-pink-500 hover:text-pink-600">
            {t("home.backToHome")}
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
          {category.name}
        </h1>
      </div>

      {category.description && (
        <Card className="bg-[#1a1a1a] border-[#262626]">
          <CardContent className="p-4">
            <p className="text-sm text-[#9CA3AF] leading-relaxed whitespace-pre-wrap">{category.description}</p>
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
                      alt={deal.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                        (e.currentTarget as HTMLImageElement).onerror = null;
                      }}
                    />
                  </div>
                  <div className="flex-1 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold line-clamp-1">{deal.name}</h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon path={mdiTag} size={0.55} />
                        <span>{t("home.deal")}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{deal.description}</p>
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
