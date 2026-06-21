import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@mdi/react";
import {
  mdiArrowLeft,
  mdiDragVertical,
  mdiRefresh,
  mdiStar,
  mdiFormatListNumbered,
} from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { categoryService, type Category } from "@/services/categoryService";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const FALLBACK_CATEGORY_IMAGE = "https://placehold.co/120x120?text=Cat";

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

interface SortableCategoryItemProps {
  id: string;
  category: Category;
  index: number;
  helperText?: string;
}

const SortableCategoryItem: React.FC<SortableCategoryItemProps> = ({
  id,
  category,
  index,
  helperText,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const imageSrc = category.image
    ? isExternalImage(category.image)
      ? category.image
      : getOptimizedImageUrl(category.image)
    : FALLBACK_CATEGORY_IMAGE;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 p-3 shadow-sm transition",
        isDragging && "ring-2 ring-pink-200 dark:ring-pink-900"
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <Icon path={mdiDragVertical} size={0.67} />
        </button>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-xl bg-muted">
            <img
              src={imageSrc}
              alt={category.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_CATEGORY_IMAGE;
                (e.currentTarget as HTMLImageElement).onerror = null;
              }}
            />
          </div>
          <div>
            <p className="font-semibold leading-tight text-sm text-foreground">
              {category.name}
            </p>
            {helperText ? (
              <p className="text-xs text-muted-foreground">{helperText}</p>
            ) : category.description ? (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {category.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <span className="text-xs font-semibold text-muted-foreground px-2 py-1 rounded-full bg-muted">
        #{index + 1}
      </span>
    </div>
  );
};

const OrderingSkeleton = () => (
  <div className="space-y-2">
    {Array.from({ length: 4 }).map((_, index) => (
      <Skeleton key={index} className="h-14 w-full rounded-2xl" />
    ))}
  </div>
);

const DealCategoryOrdering: React.FC = () => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny } = usePermissions();

  const canOrdering = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING }]);
  const canDisplayPriority = canAny([
    { resource: RESOURCES.CATEGORIES, action: ACTIONS.DISPLAY_PRIORITY },
  ]);

  if (!canOrdering && !canDisplayPriority) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {t("common.accessDenied", { defaultValue: "Access is denied" })}
      </div>
    );
  }

  const [orderingCategories, setOrderingCategories] = useState<Category[]>([]);
  const [orderingLoading, setOrderingLoading] = useState(true);
  const [featuredOrder, setFeaturedOrder] = useState<string[]>([]);
  const [initialFeaturedOrder, setInitialFeaturedOrder] = useState<string[]>([]);
  const [listOrder, setListOrder] = useState<string[]>([]);
  const [initialListOrder, setInitialListOrder] = useState<string[]>([]);
  const [isSavingFeaturedOrder, setIsSavingFeaturedOrder] = useState(false);
  const [isSavingListOrder, setIsSavingListOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const dealCategories = useMemo(() => {
    return (orderingCategories || []).filter((c) => (c?._count?.deals ?? 0) > 0);
  }, [orderingCategories]);

  const categoryDictionary = useMemo(() => {
    const map: Record<string, Category> = {};
    dealCategories.forEach((category) => {
      map[category.id] = category;
    });
    return map;
  }, [dealCategories]);

  const sortByOrder = useCallback(
    (data: Category[], field: "featuredOrder" | "listOrder") => {
      return [...data].sort((a, b) => {
        const orderA =
          typeof a[field] === "number" && (a[field] as number) > 0
            ? (a[field] as number)
            : Number.MAX_SAFE_INTEGER;
        const orderB =
          typeof b[field] === "number" && (b[field] as number) > 0
            ? (b[field] as number)
            : Number.MAX_SAFE_INTEGER;

        if (orderA === orderB) {
          return a.name.localeCompare(b.name);
        }

        return orderA - orderB;
      });
    },
    []
  );

  const loadOrderingCategories = useCallback(async () => {
    try {
      setOrderingLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(
        1,
        1000,
        "",
        "listOrder",
        "asc",
        token || undefined
      );
      setOrderingCategories(response.categories);
    } catch (error) {
      console.error("Error loading deal category ordering:", error);
      toast.error(
        t("admin.dealCategoryOrdering.loadError", {
          defaultValue: "Failed to load deal categories. Please try again.",
        })
      );
    } finally {
      setOrderingLoading(false);
    }
  }, [getToken, t]);

  useEffect(() => {
    loadOrderingCategories();
  }, [loadOrderingCategories]);

  useEffect(() => {
    if (orderingLoading) return;
    const sortedFeatured = sortByOrder(
      dealCategories.filter((category) => category.isFeatured),
      "featuredOrder"
    );
    const sortedList = sortByOrder(dealCategories, "listOrder");
    const featuredIds = sortedFeatured.map((category) => category.id);
    const listIds = sortedList.map((category) => category.id);
    setFeaturedOrder(featuredIds);
    setInitialFeaturedOrder(featuredIds);
    setListOrder(listIds);
    setInitialListOrder(listIds);
  }, [dealCategories, orderingLoading, sortByOrder]);

  const featuredItems = useMemo(
    () =>
      featuredOrder
        .map((id) => categoryDictionary[id])
        .filter((category): category is Category => Boolean(category)),
    [featuredOrder, categoryDictionary]
  );
  const listItems = useMemo(
    () =>
      listOrder
        .map((id) => categoryDictionary[id])
        .filter((category): category is Category => Boolean(category)),
    [listOrder, categoryDictionary]
  );

  const featuredHasChanges = useMemo(
    () => !arraysEqual(featuredOrder, initialFeaturedOrder),
    [featuredOrder, initialFeaturedOrder]
  );
  const listHasChanges = useMemo(
    () => !arraysEqual(listOrder, initialListOrder),
    [listOrder, initialListOrder]
  );

  const handleFeaturedDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFeaturedOrder((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  }, []);

  const handleListDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setListOrder((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  }, []);

  const handleResetOrder = useCallback(
    (type: "featured" | "list") => {
      if (type === "featured") {
        setFeaturedOrder(initialFeaturedOrder.slice());
      } else {
        setListOrder(initialListOrder.slice());
      }
    },
    [initialFeaturedOrder, initialListOrder]
  );

  const handleSaveOrder = useCallback(
    async (type: "featured" | "list") => {
      try {
        if (type === "featured") setIsSavingFeaturedOrder(true);
        else setIsSavingListOrder(true);

        const token = await getToken();
        const orderSource = type === "featured" ? featuredOrder : listOrder;
        const payload = orderSource.map((id, index) => ({
          id,
          order: index + 1,
        }));

        await categoryService.reorderCategories(type, payload, token || undefined);

        toast.success(
          t(
            `admin.dealCategoryOrdering.${
              type === "featured" ? "featuredSaved" : "listSaved"
            }`,
            {
              defaultValue:
                type === "featured"
                  ? "Featured deal categories order updated"
                  : "Deal categories order updated",
            }
          )
        );

        if (type === "featured") {
          setInitialFeaturedOrder(orderSource.slice());
        } else {
          setInitialListOrder(orderSource.slice());
        }

        await loadOrderingCategories();
      } catch (error) {
        console.error("Error saving deal category order:", error);
        toast.error(
          t(
            `admin.dealCategoryOrdering.${
              type === "featured" ? "featuredSaveError" : "listSaveError"
            }`,
            {
              defaultValue:
                type === "featured"
                  ? "Failed to update featured deal categories order."
                  : "Failed to update deal categories order.",
            }
          )
        );
      } finally {
        if (type === "featured") setIsSavingFeaturedOrder(false);
        else setIsSavingListOrder(false);
      }
    },
    [featuredOrder, getToken, listOrder, loadOrderingCategories, t]
  );

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.dealCategoryOrdering.title", {
              defaultValue: "Deal Category Ordering",
            })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.dealCategoryOrdering.description", {
              defaultValue:
                "Reorder deal categories to control the Special Offers section on the home page.",
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="border-border text-foreground hover:bg-muted">
            <Link to="/admin/deals" className="flex items-center">
              <Icon path={mdiArrowLeft} size={0.67} className="mr-2" />
              {t("common.back", { defaultValue: "Back" })}
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={loadOrderingCategories}
            disabled={orderingLoading}
            className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
          >
            <Icon
              path={mdiRefresh}
              size={0.67}
              className={cn("mr-2 h-4 w-4", orderingLoading && "animate-spin")}
            />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>
        </div>
      </div>

      <Card className="border-dashed border-pink-200/60 dark:border-pink-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-pink-500">
            <Icon path={mdiFormatListNumbered} size={0.83} />
            {t("admin.dealCategoryOrdering.sectionsTitle", {
              defaultValue: "Ordering",
            })}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("admin.dealCategoryOrdering.helper", {
              defaultValue:
                "Use the drag handles to change how deal categories appear to customers.",
            })}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold flex items-center gap-2 text-sm text-foreground">
                    <Icon path={mdiStar} size={0.67} className="text-pink-500" />
                    {t("admin.dealCategoryOrdering.featuredTitle", {
                      defaultValue: "Featured Deal Categories",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.dealCategoryOrdering.featuredDescription", {
                      defaultValue: "Controls the Special Offers carousel order.",
                    })}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {t("admin.dealCategoryOrdering.featuredCount", {
                    defaultValue: "{{count}} items",
                    count: featuredItems.length,
                  })}
                </span>
              </div>

              {!canDisplayPriority ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground text-center">
                  {t("common.accessDenied", { defaultValue: "Access is denied" })}
                </div>
              ) : orderingLoading ? (
                <OrderingSkeleton />
              ) : featuredItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground text-center">
                  {t("admin.dealCategoryOrdering.emptyFeatured", {
                    defaultValue: "No featured deal categories.",
                  })}
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFeaturedDragEnd}
                >
                  <SortableContext
                    items={featuredOrder}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {featuredItems.map((category, index) => (
                        <SortableCategoryItem
                          key={category.id}
                          id={category.id}
                          category={category}
                          index={index}
                          helperText={t("admin.dealCategoryOrdering.featuredHelper", {
                            defaultValue: `Position ${index + 1}`,
                          })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResetOrder("featured")}
                  disabled={!canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder}
                >
                  {t("common.reset", { defaultValue: "Reset" })}
                </Button>
                <Button
                  size="sm"
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                  onClick={() => handleSaveOrder("featured")}
                  disabled={!canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder || featuredItems.length === 0}
                >
                  {isSavingFeaturedOrder ? (
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  ) : (
                    <Icon path={mdiStar} size={0.67} className="mr-2" />
                  )}
                  {isSavingFeaturedOrder
                    ? t("common.saving", { defaultValue: "Saving..." })
                    : t("common.save", { defaultValue: "Save" })}
                </Button>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold flex items-center gap-2 text-sm text-foreground">
                    <Icon path={mdiFormatListNumbered} size={0.67} className="text-pink-500" />
                    {t("admin.dealCategoryOrdering.listTitle", {
                      defaultValue: "All Deal Categories",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.dealCategoryOrdering.listDescription", {
                      defaultValue: "Controls the order of deal categories in lists.",
                    })}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {t("admin.dealCategoryOrdering.listCount", {
                    defaultValue: "{{count}} items",
                    count: listItems.length,
                  })}
                </span>
              </div>

              {!canOrdering ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground text-center">
                  {t("common.accessDenied", { defaultValue: "Access is denied" })}
                </div>
              ) : orderingLoading ? (
                <OrderingSkeleton />
              ) : listItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground text-center">
                  {t("admin.dealCategoryOrdering.emptyList", {
                    defaultValue: "No deal categories found.",
                  })}
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleListDragEnd}
                >
                  <SortableContext items={listOrder} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {listItems.map((category, index) => (
                        <SortableCategoryItem
                          key={category.id}
                          id={category.id}
                          category={category}
                          index={index}
                          helperText={t("admin.dealCategoryOrdering.listHelper", {
                            defaultValue: `Position ${index + 1}`,
                          })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResetOrder("list")}
                  disabled={!canOrdering || !listHasChanges || isSavingListOrder}
                >
                  {t("common.reset", { defaultValue: "Reset" })}
                </Button>
                <Button
                  size="sm"
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                  onClick={() => handleSaveOrder("list")}
                  disabled={!canOrdering || !listHasChanges || isSavingListOrder || listItems.length === 0}
                >
                  {isSavingListOrder ? (
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  ) : (
                    <Icon path={mdiFormatListNumbered} size={0.67} className="mr-2" />
                  )}
                  {isSavingListOrder
                    ? t("common.saving", { defaultValue: "Saving..." })
                    : t("common.save", { defaultValue: "Save" })}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DealCategoryOrdering;
