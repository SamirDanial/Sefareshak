import { Link, useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";

type Meal = {
  id: string;
  name: string;
  price: number;
  compareAt?: number;
  img: string;
};

export function Trending({ items }: { items: Meal[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";
  const { currency } = useSettings();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white" style={{ marginBottom: 12 }}>
          {t("home.trending.title") || "🔥 Trending Now"}
        </h2>
        <button
          onClick={() => navigate("/menu")}
          className="text-sm font-semibold text-pink-500 hover:text-pink-400 transition-colors"
        >
          {t("home.trending.viewAll") || "View All"}
        </button>
      </div>
      <div
        className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        data-home-scroll="trending"
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
              className="group cursor-pointer flex-shrink-0 relative"
              style={{
                width: "180px",
                backgroundColor: "#262626",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              {/* Hot Badge */}
              <div
                className="absolute top-2 left-2 z-10 px-2 py-1 rounded-xl"
                style={{ backgroundColor: "#ec4899" }}
              >
                <span className="text-xs font-bold text-white">
                  {t("home.trending.hot") || "HOT"}
                </span>
              </div>
              
              {/* Image */}
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
              
              {/* Content */}
              <div className="p-3">
                <div
                  className="text-sm font-semibold mb-1.5"
                  style={{ 
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                  title={m.name}
                >
                  {m.name}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="text-base font-bold"
                    style={{ color: "#ec4899" }}
                  >
                    {formatPrice(m.price, currency)}
                  </div>
                  {m.compareAt && (
                    <div
                      className="text-sm font-medium line-through"
                      style={{ color: "#666" }}
                    >
                      {formatPrice(m.compareAt, currency)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

