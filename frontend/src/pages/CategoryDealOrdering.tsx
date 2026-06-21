import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
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
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@mdi/react";
import { mdiChevronLeft, mdiDragVertical, mdiLoading } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { categoryService, type Category } from "@/services/categoryService";
import { dealService, type Deal } from "@/services/dealService";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const FALLBACK_DEAL_IMAGE = "https://placehold.co/160x160?text=Deal";

const SortableDealRow: React.FC<{ deal: Deal; index: number }> = ({ deal, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 p-3 shadow-sm transition",
        isDragging && "ring-2 ring-pink-200 dark:ring-pink-900"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <Icon path={mdiDragVertical} size={0.67} />
        </button>
        <div className="h-12 w-12 overflow-hidden rounded-xl bg-muted shrink-0">
          <img
            src={
              deal.image
                ? isExternalImage(deal.image)
                  ? deal.image
                  : getOptimizedImageUrl(deal.image)
                : FALLBACK_DEAL_IMAGE
            }
            alt={deal.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_DEAL_IMAGE;
              (e.currentTarget as HTMLImageElement).onerror = null;
            }}
          />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{deal.name}</div>
          {deal.description ? (
            <div className="text-xs text-muted-foreground truncate">{deal.description}</div>
          ) : null}
        </div>
      </div>
      <span className="text-xs font-semibold text-muted-foreground px-2 py-1 rounded-full bg-muted">
        #{index + 1}
      </span>
    </div>
  );
};

const CategoryDealOrdering: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny } = usePermissions();

  const [category, setCategory] = useState<Category | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canReorderCategoryDeals = canAny([
    { resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY },
  ]);

  if (!canReorderCategoryDeals) {
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

  const hasChanges = useMemo(() => !arraysEqual(order, initialOrder), [order, initialOrder]);

  const loadCategoryDeals = useCallback(async () => {
    if (!categoryId) return;
    try {
      setLoading(true);
      const token = await getToken();
      const [categoryResponse, dealsResponse] = await Promise.all([
        categoryService.getCategoryById(categoryId, token || undefined),
        dealService.getDeals(1, 500, "", "listOrder", "asc", categoryId, token || undefined),
      ]);

      setCategory(categoryResponse);
      const categoryDeals = dealsResponse.deals || [];
      setDeals(categoryDeals);
      const ids = categoryDeals.map((deal) => deal.id);
      setOrder(ids);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading category deals for ordering:", error);
      toast.error(
        t("admin.categoryDealOrdering.loadError", {
          defaultValue: "Failed to load category deals.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [categoryId, getToken, t]);

  useEffect(() => {
    if (!categoryId) {
      navigate("/admin/deals");
      return;
    }
    loadCategoryDeals();
  }, [categoryId, loadCategoryDeals, navigate]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrder((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });

    setDeals((items) => {
      const oldIndex = items.findIndex((deal) => deal.id === active.id);
      const newIndex = items.findIndex((deal) => deal.id === over.id);
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
      await dealService.reorderCategoryDeals(categoryId, payload, token || undefined);
      toast.success(
        t("admin.categoryDealOrdering.saveSuccess", {
          defaultValue: "Deal order updated",
        })
      );
      setInitialOrder(order.slice());
      await loadCategoryDeals();
    } catch (error) {
      console.error("Error saving category deal order:", error);
      toast.error(
        t("admin.categoryDealOrdering.saveError", {
          defaultValue: "Failed to save deal order.",
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
          {t("admin.categoryDealOrdering.categoryNotFound", {
            defaultValue: "Category not found.",
          })}
        </p>
        <Button variant="outline" onClick={() => navigate("/admin/deals")}>
          {t("common.back", { defaultValue: "Back" })}
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
            onClick={() => navigate("/admin/deals")}
          >
            <Icon path={mdiChevronLeft} size={0.67} className="mr-1" />
            {t("admin.dealManagement.backToCategories", {
              defaultValue: "Back to Deal Management",
            })}
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.categoryDealOrdering.title", {
                defaultValue: "Deal Ordering: {{category}}",
                category: category.name,
              })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryDealOrdering.description", {
                defaultValue: "Drag and drop to set the order of deals in this category.",
              })}
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
            {t("common.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </div>

      {deals.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("admin.categoryDealOrdering.emptyTitle", {
                defaultValue: "No deals in this category",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryDealOrdering.emptyDescription", {
                defaultValue: "Create some deals first, then you can reorder them.",
              })}
            </p>
            <Button className="mt-4" asChild>
              <Link to={`/admin/deals?categoryId=${categoryId}`}>
                {t("admin.categoryDealOrdering.manageDeals", {
                  defaultValue: "Manage deals",
                })}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg font-semibold text-foreground">
              {t("admin.categoryDealOrdering.listTitle", {
                defaultValue: "Deals ({{count}})",
                count: deals.length,
              })}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryDealOrdering.helper", {
                defaultValue: "Use the drag handle to reorder.",
              })}
            </p>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {deals.map((deal, index) => (
                    <SortableDealRow key={deal.id} deal={deal} index={index} />
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

export default CategoryDealOrdering;
