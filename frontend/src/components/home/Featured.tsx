import { Link } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import Icon from "@mdi/react";
import { mdiChevronLeft, mdiChevronRight } from "@mdi/js";

type Meal = {
  id: string;
  name: string;
  price: number;
  compareAt?: number;
  img: string;
  isAvailableNow?: boolean;
};

export function Featured({
  items,
}: {
  items: Meal[];
  onAdd?: (m: Meal) => void;
}) {
  const { t } = useTranslation();
  const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";
  const { currency } = useSettings();

  const rows: Meal[][] = [];
  for (let i = 0; i < items.length; i += 5) {
    rows.push(items.slice(i, i + 5));
  }

  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scrollStates, setScrollStates] = useState<Record<number, { canScrollLeft: boolean; canScrollRight: boolean }>>({});

  const checkScroll = (rowIndex: number) => {
    const ref = rowRefs.current[rowIndex];
    if (ref) {
      const { scrollLeft, scrollWidth, clientWidth } = ref;
      setScrollStates(prev => ({
        ...prev,
        [rowIndex]: {
          canScrollLeft: scrollLeft > 5,
          canScrollRight: scrollLeft < scrollWidth - clientWidth - 5,
        },
      }));
    }
  };

  const scrollLeft = (rowIndex: number) => {
    const ref = rowRefs.current[rowIndex];
    if (ref) {
      ref.scrollTo({ left: Math.max(0, ref.scrollLeft - 176), behavior: "smooth" });
    }
  };

  const scrollRight = (rowIndex: number) => {
    const ref = rowRefs.current[rowIndex];
    if (ref) {
      ref.scrollTo({ left: ref.scrollLeft + 176, behavior: "smooth" });
    }
  };

  useEffect(() => {
    rows.forEach((_, index) => checkScroll(index));
    const handleResize = () => {
      rows.forEach((_, index) => checkScroll(index));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white" style={{ marginBottom: 12 }}>
          {t("home.featured")}
        </h2>
      </div>
      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="relative">
            {scrollStates[rowIndex]?.canScrollLeft && (
              <button
                onClick={() => scrollLeft(rowIndex)}
                className="absolute -left-2 top-0 bottom-0 w-10 bg-black/70 flex items-center justify-center z-10 hover:bg-black/80 transition-colors"
                style={{ height: "100%" }}
              >
                <Icon path={mdiChevronLeft} size={1} className="text-white" />
              </button>
            )}
            <div
              ref={(el) => { rowRefs.current[rowIndex] = el; }}
              className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              data-home-scroll={`featured-${rowIndex}`}
              onScroll={() => checkScroll(rowIndex)}
            >
              <div className="flex" style={{ minWidth: "max-content", gap: 16 }}>
                {row.map((m) => (
                  <Link
                    key={m.id}
                    to={`/meal/${m.id}?from=home`}
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
                        style={!m.isAvailableNow ? { filter: "grayscale(1)", opacity: 0.85 } : undefined}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                          (e.currentTarget as HTMLImageElement).onerror = null;
                        }}
                      />
                    </div>
                    <div className="p-3" style={{ backgroundColor: "rgba(0, 0, 0, 0)" }}>
                      <div
                        className="text-sm font-semibold mb-1"
                        style={{
                          color: "#111",
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
            {scrollStates[rowIndex]?.canScrollRight && (
              <button
                onClick={() => scrollRight(rowIndex)}
                className="absolute -right-2 top-0 bottom-0 w-10 bg-black/70 flex items-center justify-center z-10 hover:bg-black/80 transition-colors"
                style={{ height: "100%" }}
              >
                <Icon path={mdiChevronRight} size={1} className="text-white" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
