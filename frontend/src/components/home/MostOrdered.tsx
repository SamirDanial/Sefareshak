import { Link } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";

type Meal = {
  id: string;
  name: string;
  price: number;
  img: string;
};

export function MostOrdered({ items }: { items: Meal[] }) {
  const { t } = useTranslation();
  const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";
  const { currency } = useSettings();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white" style={{ marginBottom: 12 }}>
          {t("home.mostOrdered")}
        </h2>
      </div>
      <div
        className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        data-home-scroll="most-ordered"
      >
        <div
          className="flex"
          style={{ minWidth: "max-content", gap: 16 }}
        >
          {items.map((m) => (
            <Link
              key={m.id}
              to={`/meal/${m.id}`}
              data-home-anchor={`meal:${m.id}`}
              className="group cursor-pointer flex-shrink-0"
              style={{
                width: "160px",
                backgroundColor: "#fff",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <div className="w-full h-[120px] overflow-hidden">
                <img
                  src={m.img}
                  alt={m.name}
                  className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                    (e.currentTarget as HTMLImageElement).onerror = null;
                  }}
                />
              </div>
              <div className="p-3">
                <div
                  className="text-sm font-semibold mb-1"
                  style={{ 
                    color: "#333",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                  title={m.name}
                >
                  {m.name}
                </div>
                <div
                  className="text-base font-bold"
                  style={{ color: "#ec4899" }}
                >
                  {formatPrice(m.price, currency)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
