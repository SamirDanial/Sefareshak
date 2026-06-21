import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { categoryService, type Category } from "@/services/categoryService";
import { mealService, type Meal } from "@/services/mealService";
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
import { mdiChevronLeft, mdiDragVertical, mdiLoading } from "@mdi/js";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const FALLBACK_MEAL_IMAGE = "https://placehold.co/160x160?text=Meal";

const SortableMealRow: React.FC<{
  meal: Meal;
  index: number;
}> = ({ meal, index }) => {
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
          </div>
        </div>
      </div>
      <span className="text-xs font-semibold text-muted-foreground px-2 py-1 rounded-full bg-muted">
        #{index + 1}
      </span>
    </div>
  );
};

const CategoryMealOrdering: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny } = usePermissions();
  const [category, setCategory] = useState<Category | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canReorderCategoryMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_CATEGORY },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_CATEGORY },
  ]);

  if (!canReorderCategoryMeals) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {t("common.accessDenied", { defaultValue: "Access is denied" })}
      </div>
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const hasChanges = useMemo(() => {
    if (order.length !== initialOrder.length) {
      return true;
    }
    return order.some((id, index) => id !== initialOrder[index]);
  }, [order, initialOrder]);

  const loadCategoryMeals = useCallback(async () => {
    if (!categoryId) return;
    try {
      setLoading(true);
      const token = await getToken();
      const [categoryResponse, mealsResponse] = await Promise.all([
        categoryService.getCategoryById(categoryId, token || undefined),
        mealService.getMeals(
          1,
          200,
          "",
          "listOrder",
          "asc",
          categoryId,
          token || undefined
        ),
      ]);

      setCategory(categoryResponse);
      const categoryMeals = mealsResponse.meals || [];
      setMeals(categoryMeals);
      const ids = categoryMeals.map((meal) => meal.id);
      setOrder(ids);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading category meals for ordering:", error);
      toast.error(
        t("admin.categoryMealOrdering.loadError", {
          defaultValue: "Failed to load category meals.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [categoryId, getToken, t]);

  useEffect(() => {
    if (!categoryId) {
      navigate("/admin/menu");
      return;
    }
    loadCategoryMeals();
  }, [categoryId, loadCategoryMeals, navigate]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrder((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });

    setMeals((items) => {
      const oldIndex = items.findIndex((meal) => meal.id === active.id);
      const newIndex = items.findIndex((meal) => meal.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleSave = async () => {
    if (!categoryId) return;
    try {
      setSaving(true);
      const token = await getToken();
      const payload = order.map((id, index) => ({
        id,
        order: index + 1,
      }));
      await mealService.reorderCategoryMeals(categoryId, payload, token || undefined);
      toast.success(
        t("admin.categoryMealOrdering.saveSuccess", {
          defaultValue: "Meal order updated",
        })
      );
      setInitialOrder(order.slice());
      await loadCategoryMeals();
    } catch (error) {
      console.error("Error saving category meal order:", error);
      toast.error(
        t("admin.categoryMealOrdering.saveError", {
          defaultValue: "Failed to save meal order.",
        })
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center space-y-4 py-10">
        <p className="text-muted-foreground">
          {t("admin.categoryMealOrdering.categoryNotFound", {
            defaultValue: "Category not found.",
          })}
        </p>
        <Button variant="outline" onClick={() => navigate("/admin/menu")}>
          {t("common.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit px-0 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/admin/menu")}
          >
            <Icon path={mdiChevronLeft} size={0.67} className="mr-1" />
            {t("admin.menuManagement.backToCategories")}
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.categoryMealOrdering.title", {
                category: category.name,
              })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryMealOrdering.description")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {saving && <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />}
            {t("admin.categoryMealOrdering.save")}
          </Button>
        </div>
      </div>

      {meals.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("admin.categoryMealOrdering.emptyTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryMealOrdering.emptyDescription")}
            </p>
            <Button
              className="mt-4"
              asChild
            >
              <Link to={`/admin/menu/${categoryId}`}>
                {t("admin.categoryMealOrdering.manageMeals")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg font-semibold text-foreground">
              {t("admin.categoryMealOrdering.listTitle", {
                count: meals.length,
              })}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryMealOrdering.helper")}
            </p>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={order}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {meals.map((meal, index) => (
                    <SortableMealRow key={meal.id} meal={meal} index={index} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CategoryMealOrdering;

