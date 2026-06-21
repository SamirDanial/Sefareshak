import { useNavigate } from "react-router-dom";
import type { DealCategory } from "@/hooks/useApi";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";

export function DealCategories({
  items,
  onClick,
}: {
  items: DealCategory[];
  onClick?: (c: DealCategory) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const FALLBACK_IMG = "https://placehold.co/800x800?text=Deals";

  const handleCategoryClick = (category: DealCategory) => {
    navigate(`/deal-category/${category.id}`);
    onClick?.(category);
  };

  const getCategoryName = (categoryName: string): string => {
    const translationKey = `categories.${categoryName.toLowerCase().replace(/\s+/g, "")}`;
    const translated = t(translationKey, { defaultValue: categoryName });
    return translated !== translationKey ? translated : categoryName;
  };

  const truncateCategoryName = (name: string): string => {
    const translatedName = getCategoryName(name);
    if (translatedName.length <= 12) {
      return translatedName;
    }
    return translatedName.substring(0, 9) + "...";
  };

  const rows: DealCategory[][] = [];
  for (let i = 0; i < items.length; i += 5) {
    rows.push(items.slice(i, i + 5));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">{t("home.dealCategories")}</h2>
        <button
          onClick={() => navigate("/deal-categories")}
          className="text-sm text-pink-500 hover:text-pink-400 font-semibold transition-colors px-3 py-1.5"
        >
          {t("home.showAll") || "Show All"}
        </button>
      </div>
      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            data-home-scroll={`deal-categories-${rowIndex}`}
          >
            <div className="flex gap-4 pb-2" style={{ minWidth: "max-content" }}>
              {row.map((c) => (
                <div
                  key={c.id}
                  data-home-anchor={`deal-category:${c.id}`}
                  className="group cursor-pointer flex-shrink-0"
                  onClick={() => handleCategoryClick(c)}
                  style={{
                    width: "120px",
                    backgroundColor: "#262626",
                    borderRadius: "16px",
                    overflow: "hidden",
                  }}
                >
                  <div className="w-full h-[90px] bg-[#333] overflow-hidden" style={{ width: "120px" }}>
                    <img
                      src={
                        c.image
                          ? isExternalImage(c.image)
                            ? c.image
                            : getOptimizedImageUrl(c.image)
                          : FALLBACK_IMG
                      }
                      alt={c.name}
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      style={{ width: "120px", height: "90px" }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                        (e.currentTarget as HTMLImageElement).onerror = null;
                      }}
                    />
                  </div>
                  <div className="text-center text-sm font-semibold text-white p-3">
                    {truncateCategoryName(c.name)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
