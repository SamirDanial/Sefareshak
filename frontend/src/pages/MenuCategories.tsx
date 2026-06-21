import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import Icon from "@mdi/react";
import { mdiRefresh, mdiMagnify, mdiChevronRight, mdiImage, mdiPizza, mdiPackageVariant } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { categoryService, type Category } from "@/services/categoryService";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";

const MenuCategories: React.FC = () => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canAny } = usePermissions();

  const canReorderFeaturedMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_FEATURED },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_FEATURED },
  ]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setRefreshing(true);
      const token = await getToken();
      const data = await categoryService.getCategories(
        1,
        100,
        "",
        "listOrder",
        "asc",
        token || undefined
      );
      // Show all categories (both active and inactive) in the menu management listing
      setCategories(data.categories);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const visibleCategories = categories.filter((category) => {
      const mealsCount = category._count?.meals ?? 0;
      const dealsCount = category._count?.deals ?? 0;
      const hasMeals = mealsCount > 0;
      const isEmpty = mealsCount === 0 && dealsCount === 0;

      if (showEmptyCategories) return isEmpty;
      return hasMeals;
    });

    if (!normalizedSearch) return visibleCategories;

    return visibleCategories.filter((category) =>
      category.name.toLowerCase().includes(normalizedSearch)
    );
  }, [categories, searchTerm, showEmptyCategories]);

  const handleCategoryClick = (category: Category) => {
    navigate(`/admin/menu/${category.id}`);
  };

  const getImageUrl = (imagePath: string): string => {
    if (!imagePath) return "";
    if (isExternalImage(imagePath)) return imagePath;
    return getOptimizedImageUrl(imagePath, "medium");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.menuCategories.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.menuCategories.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canReorderFeaturedMeals && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-300 dark:hover:bg-pink-500/10"
            >
              <Link to="/admin/menu/featured-ordering">
                {t("admin.featuredMealsOrdering.cta")}
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadCategories}
            disabled={refreshing}
            className="border-border text-foreground hover:bg-muted/70"
          >
            <Icon
              path={mdiRefresh}
              size={0.67}
              className={cn("mr-2", { "animate-spin": refreshing })}
            />
            {t("admin.menuCategories.refresh")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4">
            <div className="relative flex-1 w-full sm:w-auto">
              <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.menuCategories.searchPlaceholder")}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9 bg-transparent text-foreground placeholder:text-muted-foreground border-border"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="show-empty-menu-categories"
                checked={showEmptyCategories}
                onCheckedChange={setShowEmptyCategories}
              />
              <label
                htmlFor="show-empty-menu-categories"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                {t("admin.menuCategories.showEmptyCategories")}
              </label>
            </div>
            <Badge variant="secondary">
              {t("admin.menuCategories.totalCategories", {
                count: categories.length,
              })}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-wrap justify-between p-3 gap-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="mb-4 rounded-2xl overflow-hidden" style={{ width: '48%' }}>
              <Skeleton className="w-full h-36" />
              <CardContent className="p-3 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Icon path={mdiPackageVariant} size={2} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {t("admin.menuCategories.noMenuCategoriesFound", {
                defaultValue: "No menu categories found",
              })}
            </p>
            {searchTerm.trim().length > 0 && (
              <div className="mt-4">
                <Button onClick={() => setSearchTerm("")}>
                  {t("admin.menuCategories.clearSearch")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap justify-between p-3 gap-0">
          {filteredCategories.map((category) => (
            <Card
              key={category.id}
              className={cn(
                "group mb-4 rounded-2xl overflow-hidden border border-border bg-card cursor-pointer transition-all hover:shadow-md",
                { "opacity-60": !category.isActive }
              )}
              style={{ width: '48%' }}
              onClick={() => handleCategoryClick(category)}
            >
              {category.image ? (
                <div className="w-full h-36 overflow-hidden bg-muted">
                  <img
                    src={getImageUrl(category.image)}
                    alt={category.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      console.error("Failed to load category image", {
                        src: event.currentTarget.src,
                        categoryName: category.name,
                      });
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-36 bg-muted flex items-center justify-center">
                  <Icon path={mdiImage} size={1.33} className="text-muted-foreground" />
                </div>
              )}
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <CardTitle className="text-base font-bold text-foreground line-clamp-1">
                    {category.name}
                  </CardTitle>
                  {!category.isActive && (
                    <Badge variant="secondary" className="text-xs px-2 py-1">
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-4">
                  {category.description || t("admin.menuCategories.noDescription")}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Icon path={mdiPizza} size={0.5} className="text-pink-500" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {t("admin.menuCategories.mealCount", {
                        count: category._count?.meals ?? 0,
                      })}
                    </span>
                  </div>
                  <Icon path={mdiChevronRight} size={0.67} className="text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MenuCategories;

