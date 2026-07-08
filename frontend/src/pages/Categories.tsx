import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCategories } from "@/hooks/useApi";
import { useBranch } from "@/contexts/BranchContext";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import Icon from "@mdi/react";
import { mdiArrowLeft } from "@mdi/js";
import { CategoriesSkeleton } from "@/components/ui/skeleton";
import { getLocalizedName, getLocalizedDescription } from "@/utils/localization";

const FALLBACK_IMG = "https://placehold.co/800x600?text=Food";

export default function Categories() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { branch } = useBranch();
  const { categories, loading, error } = useCategories(undefined, branch?.id); // Get all categories, not just featured

  // Function to get translated category name
  const getCategoryName = (category: any): string => {
    return getLocalizedName(category.name, category.nameFa, i18n.language);
  };

  const getCategoryDescription = (category: any): string | null => {
    return getLocalizedDescription(category.description, category.descriptionFa, i18n.language);
  };

  // Function to truncate category name
  const truncateCategoryName = (category: any): string => {
    const translatedName = getCategoryName(category);
    if (translatedName.length <= 12) {
      return translatedName;
    }
    return translatedName.substring(0, 9) + "...";
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
        >
          <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
          {t("home.categories")}
        </h1>
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <CategoriesSkeleton />
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500">Failed to load categories: {error}</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t("home.noCategories") || "No categories available"}
            </p>
          </div>
        ) : (
          <div
            className="flex flex-wrap"
            style={{ justifyContent: "space-between", paddingTop: 12, paddingBottom: 12 }}
          >
            {categories.map((category, index) => (
              <div
                key={category.id}
                className="cursor-pointer overflow-hidden mb-4 relative"
                style={{
                  width: "48%",
                  borderRadius: 20,
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #262626",
                  boxShadow: "0 6px 12px rgba(0, 0, 0, 0.4)",
                  marginRight: index % 2 === 0 ? "2%" : 0,
                  marginLeft: index % 2 === 1 ? "2%" : 0,
                }}
                onClick={() => navigate(`/category/${category.id}`)}
              >
                <div
                  className="relative w-full overflow-hidden"
                  style={{ height: 200, backgroundColor: "#262626" }}
                >
                  <img
                    src={
                      category.image
                        ? isExternalImage(category.image)
                          ? category.image
                          : getOptimizedImageUrl(category.image)
                        : FALLBACK_IMG
                    }
                    alt={getCategoryName(category)}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                      (e.currentTarget as HTMLImageElement).onerror = null;
                    }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: "rgba(0, 0, 0, 0)" }}
                  />
                </div>
                <div className="p-4" style={{ backgroundColor: "#1a1a1a" }}>
                  <h3
                    className="font-bold mb-1.5"
                    style={{
                      color: "#fff",
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                    }}
                    title={getCategoryName(category)}
                  >
                    {truncateCategoryName(category)}
                  </h3>
                  {getCategoryDescription(category) && (
                    <p
                      className="leading-5 overflow-hidden"
                      style={{
                        color: "#9CA3AF",
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={getCategoryDescription(category) || ""}
                    >
                      {getCategoryDescription(category)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
