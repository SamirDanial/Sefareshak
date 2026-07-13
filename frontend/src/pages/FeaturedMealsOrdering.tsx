import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { mealService, type Meal } from "@/services/mealService";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
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
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiArrowRight, mdiDragVertical, mdiRefresh, mdiStar } from "@mdi/js";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const FALLBACK_MEAL_IMAGE = "https://placehold.co/160x160?text=Meal";

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

interface SortableMealCardProps {
  meal: Meal;
  index: number;
}

const SortableMealCard: React.FC<SortableMealCardProps> = ({ meal, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: meal.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const imageSrc = meal.image
    ? isExternalImage(meal.image)
      ? meal.image
      : getOptimizedImageUrl(meal.image)
    : FALLBACK_MEAL_IMAGE;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/90 p-3 shadow-sm",
        isDragging && "ring-2 ring-pink-200 dark:ring-pink-900"
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <Icon path={mdiDragVertical} size={0.83} />
        </button>
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-xl bg-muted">
            <img
              src={imageSrc}
              alt={meal.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_MEAL_IMAGE;
                (e.currentTarget as HTMLImageElement).onerror = null;
              }}
            />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{meal.name}</p>
            {meal.category?.name && (
              <p className="text-xs text-muted-foreground">
                {meal.category.name}
              </p>
            )}
          </div>
        </div>
      </div>
      <span className="text-xs font-semibold text-muted-foreground px-2 py-1 rounded-full bg-muted">
        #{index + 1}
      </span>
    </div>
  );
};

const FeaturedMealsOrdering: React.FC = () => {
  const { getToken } = useAuth();
  const { t, i18n } = useTranslation();
  const { canAny } = usePermissions();
  const [featuredMeals, setFeaturedMeals] = useState<Meal[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canReorderFeaturedMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_FEATURED },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_FEATURED },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const hasChanges = useMemo(
    () => !arraysEqual(order, initialOrder),
    [order, initialOrder]
  );

  const loadFeaturedMeals = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await mealService.getMeals(
        1,
        100,
        "",
        "featuredOrder",
        "asc",
        "",
        token || undefined,
        { isFeatured: true }
      );
      const meals = response.meals;
      setFeaturedMeals(meals);
      const ids = meals.map((meal) => meal.id);
      setOrder(ids);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading featured meals:", error);
      toast.error(
        t("admin.featuredMealsOrdering.loadError", {
          defaultValue: "Failed to load featured meals.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, t]);

  useEffect(() => {
    loadFeaturedMeals();
  }, [loadFeaturedMeals]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrder((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });

    setFeaturedMeals((items) => {
      const oldIndex = items.findIndex((meal) => meal.id === active.id);
      const newIndex = items.findIndex((meal) => meal.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleReset = () => {
    setOrder(initialOrder.slice());
    setFeaturedMeals((items) => {
      const map = new Map(items.map((meal) => [meal.id, meal]));
      return initialOrder.map((id) => map.get(id)!).filter(Boolean);
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = await getToken();
      const payload = order.map((id, index) => ({
        id,
        order: index + 1,
      }));
      await mealService.reorderFeaturedMeals(payload, token || undefined);
      toast.success(
        t("admin.featuredMealsOrdering.saveSuccess", {
          defaultValue: "Featured order updated",
        })
      );
      setInitialOrder(order.slice());
      await loadFeaturedMeals();
    } catch (error) {
      console.error("Error saving featured meal order:", error);
      toast.error(
        t("admin.featuredMealsOrdering.saveError", {
          defaultValue: "Failed to update featured order.",
        })
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canReorderFeaturedMeals) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {t("common.accessDenied", { defaultValue: "Access is denied" })}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.featuredMealsOrdering.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.featuredMealsOrdering.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            asChild
            className="border-border text-foreground hover:bg-muted"
          >
            <Link to="/admin/menu" className="flex items-center">
              <Icon path={i18n.language === "da" ? mdiArrowRight : mdiArrowLeft} size={0.67} className="mr-2" />
              {t("common.back")}
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={loadFeaturedMeals}
            disabled={loading}
            className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
          >
            <Icon path={mdiRefresh} size={0.67} className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("admin.featuredMealsOrdering.refresh")}
          </Button>
        </div>
      </div>

      <Card className="border border-border/60 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-pink-500">
            <Icon path={mdiStar} size={0.83} />
            {t("admin.featuredMealsOrdering.listTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("admin.featuredMealsOrdering.helper")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : featuredMeals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground text-center">
              {t("admin.featuredMealsOrdering.empty")}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={order}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {order.map((id, index) => {
                    const meal = featuredMeals.find((item) => item.id === id);
                    if (!meal) return null;
                    return <SortableMealCard key={id} meal={meal} index={index} />;
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges || saving || loading}
            >
              {t("admin.featuredMealsOrdering.reset")}
            </Button>
            <Button
              size="sm"
              className="bg-pink-500 hover:bg-pink-600 text-white"
              onClick={handleSave}
              disabled={!hasChanges || saving || loading || featuredMeals.length === 0}
            >
              {saving ? (
                <>
                  <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  {t("admin.featuredMealsOrdering.saving")}
                </>
              ) : (
                <>
                  <Icon path={mdiStar} size={0.67} className="mr-2" />
                  {t("admin.featuredMealsOrdering.save")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeaturedMealsOrdering;

