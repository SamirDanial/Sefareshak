import { useNavigate } from "react-router-dom";
import type { Category } from "@/hooks/useApi";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import Icon from "@mdi/react";
import { mdiChevronLeft, mdiChevronRight } from "@mdi/js";
import { getLocalizedName } from "@/utils/localization";

export function Categories({
  items,
  onClick,
  getPath,
}: {
  items: Category[];
  onClick?: (c: Category) => void;
  getPath?: (c: Category) => string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollX = useRef(0);

  const handleCategoryClick = (category: Category) => {
    navigate(getPath ? getPath(category) : `/category/${category.id}`);
    onClick?.(category);
  };
const getCategoryName = (category: Category): string => {
    return getLocalizedName(category.name, category.nameFa, i18n.language);
  };

  const truncateCategoryName = (category: Category): string => {
    const translatedName = getCategoryName(category);
    if (translatedName.length <= 12) {
      return translatedName;
    }
    return translatedName.substring(0, 9) + "...";
  };

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      scrollX.current = scrollLeft;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [items]);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: Math.max(0, scrollX.current - 136), behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: scrollX.current + 136, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">{t("home.categories")}</h2>
        <button
          onClick={() => navigate("/categories")}
          className="text-sm text-pink-500 hover:text-pink-400 font-semibold transition-colors px-3 py-1.5"
        >
          {t("home.showAll") || "Show All"}
        </button>
      </div>
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-0 bottom-0 w-10 bg-black/70 flex items-center justify-center z-10 hover:bg-black/80 transition-colors"
            style={{ height: "100%" }}
          >
            <Icon path={mdiChevronLeft} size={1} className="text-white" />
          </button>
        )}
        <div
          ref={scrollRef}
          className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          data-home-scroll="categories"
          onScroll={checkScroll}
        >
          <div className="flex gap-4 pb-2" style={{ minWidth: "max-content" }}>
            {items.map((c) => (
              <div
                key={c.id}
                data-home-anchor={`category:${c.id}`}
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
                    alt={getCategoryName(c)}
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    style={{ width: "120px", height: "90px" }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                      (e.currentTarget as HTMLImageElement).onerror = null;
                    }}
                  />
                </div>
                <div className="text-center text-sm font-semibold text-white p-3">
                  {truncateCategoryName(c)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {canScrollRight && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-0 bottom-0 w-10 bg-black/70 flex items-center justify-center z-10 hover:bg-black/80 transition-colors"
            style={{ height: "100%" }}
          >
            <Icon path={mdiChevronRight} size={1} className="text-white" />
          </button>
        )}
      </div>
    </div>
  );
}
