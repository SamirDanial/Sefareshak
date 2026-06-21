import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";

type Deal = {
  id: string;
  name: string;
  price: number;
  compareAt: number;
  img: string;
};

export function PriceCompare({ items }: { items: Deal[] }) {
  const { t } = useTranslation();
  const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";
  const { currency } = useSettings();
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("home.greatValue")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((m) => (
          <Link key={m.id} to={`/meal/${m.id}`}>
            <Card className="overflow-hidden hover:scale-[1.02] transition-transform duration-200 cursor-pointer shadow-md hover:shadow-lg">
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row">
                  <div className="w-full sm:w-32 h-32 sm:h-auto flex-shrink-0">
                    <img
                      src={m.img}
                      alt={m.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          FALLBACK_IMG;
                        (e.currentTarget as HTMLImageElement).onerror = null;
                      }}
                    />
                  </div>
                  <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
                    <div className="space-y-1.5 mb-3">
                      <div className="text-base font-semibold line-clamp-2">
                        {m.name}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium">
                        {t("home.compareAndSave")}
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-lg font-bold text-white">
                        {formatPrice(m.price, currency)}
                      </div>
                      <div className="text-sm text-muted-foreground line-through">
                        {formatPrice(m.compareAt, currency)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
