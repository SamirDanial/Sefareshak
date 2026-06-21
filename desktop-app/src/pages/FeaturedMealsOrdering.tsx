import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft, GripVertical, RefreshCw, Star } from "lucide-react";
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
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { mealService, type Meal } from "../services/mealService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const isExternalImage = (url: string): boolean => {
  return url.startsWith("http://") || url.startsWith("https://");
};

class FeaturedMealsOrderingErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  public state = { error: null as Error | null };

  public static getDerivedStateFromError(error: Error) {
    return { error };
  }

  public componentDidCatch(error: Error) {
    console.error("FeaturedMealsOrdering crashed:", error);
  }

  public render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "24px" }}>
          <div
            style={{
              border: "1px solid #fecaca",
              backgroundColor: "#fff1f2",
              borderRadius: "12px",
              padding: "16px",
              color: "#9f1239",
              fontSize: "14px",
              fontWeight: 700,
              marginBottom: "10px",
            }}
          >
            Featured ordering page crashed.
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              color: "#111827",
              fontSize: "12px",
              lineHeight: 1.4,
            }}
          >
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const getOptimizedImageUrl = (imagePath: string | null): string => {
  if (!imagePath) return "";
  if (isExternalImage(imagePath)) return imagePath;
  if (imagePath.startsWith("/uploads/images/")) {
    const filename = imagePath.replace("/uploads/images/", "");
    return `${API_BASE_URL}/uploads/images/${filename}`;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

interface SortableMealRowProps {
  meal: Meal;
  index: number;
}

const SortableMealRow: React.FC<SortableMealRowProps> = ({ meal, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: meal.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const imageUrl = meal.image ? getOptimizedImageUrl(meal.image) : "";

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        border: isDragging ? "1px solid #fbcfe8" : "1px solid #e5e7eb",
        boxShadow: isDragging ? "0 0 0 3px rgba(236, 72, 153, 0.12)" : "none",
        borderRadius: "14px",
        padding: "10px 12px",
        backgroundColor: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="button"
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            cursor: "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6b7280",
          }}
          {...attributes}
          {...listeners}
        >
          <GripVertical style={{ width: "16px", height: "16px" }} />
        </button>

        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "12px",
            overflow: "hidden",
            backgroundColor: "#f3f4f6",
            flex: "0 0 auto",
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={meal.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: "12px",
              }}
            >
              No image
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827" }}>{meal.name}</div>
          <div style={{ fontSize: "12px", color: "#6b7280" }}>{meal.category?.name || ""}</div>
        </div>
      </div>

      <div
        style={{
          fontSize: "12px",
          fontWeight: 800,
          color: "#6b7280",
          padding: "6px 10px",
          borderRadius: "999px",
          backgroundColor: "#f3f4f6",
        }}
      >
        #{index + 1}
      </div>
    </div>
  );
};

const FeaturedMealsOrdering: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();

  const canReorderFeaturedMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_FEATURED },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_FEATURED },
  ]);

  const [featuredMeals, setFeaturedMeals] = useState<Meal[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const hasChanges = useMemo(() => !arraysEqual(order, initialOrder), [order, initialOrder]);

  const loadFeaturedMeals = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await mealService.getMeals(
        1,
        200,
        "",
        "featuredOrder",
        "asc",
        "",
        token || undefined,
        { isFeatured: true }
      );

      const meals = response.meals || [];
      setFeaturedMeals(meals);
      const ids = meals.map((meal) => meal.id);
      setOrder(ids);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading featured meals:", error);
      alert(
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
      const payload = order.map((id, index) => ({ id, order: index + 1 }));
      await mealService.reorderFeaturedMeals(payload, token || undefined);
      setInitialOrder(order.slice());
      await loadFeaturedMeals();
    } catch (error) {
      console.error("Error saving featured meal order:", error);
      alert(
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
      <div style={{ padding: "24px" }}>
        <div
          style={{
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "16px",
            color: "#6b7280",
            fontSize: "14px",
          }}
        >
          {t("common.accessDenied", { defaultValue: "Access is denied" })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", height: "100%", overflow: "auto" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#ec4899",
              margin: 0,
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Star style={{ width: "20px", height: "20px" }} />
            {t("admin.featuredMealsOrdering.title", { defaultValue: "Featured Meals Ordering" })}
          </h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            {t("admin.featuredMealsOrdering.description", {
              defaultValue: "Reorder meals shown in the featured section.",
            })}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link
            to="/admin/menu"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            <ArrowLeft style={{ width: "16px", height: "16px" }} />
            {t("common.back", { defaultValue: "Back" })}
          </Link>

          <button
            type="button"
            onClick={loadFeaturedMeals}
            disabled={loading || saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              cursor: loading || saving ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            <RefreshCw
              style={{
                width: "16px",
                height: "16px",
                color: "#6b7280",
                animation: loading ? "spin 1s linear infinite" : "none",
              }}
            />
            {t("admin.featuredMealsOrdering.refresh", { defaultValue: "Refresh" })}
          </button>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          backgroundColor: "#ffffff",
          padding: "16px",
        }}
      >
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#6b7280" }}>
            <RefreshCw style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
            {t("admin.featuredMealsOrdering.loading", { defaultValue: "Loading..." })}
          </div>
        ) : featuredMeals.length === 0 ? (
          <div
            style={{
              padding: "24px",
              borderRadius: "12px",
              border: "1px dashed #e5e7eb",
              color: "#6b7280",
              fontSize: "14px",
              textAlign: "center",
            }}
          >
            {t("admin.featuredMealsOrdering.empty", { defaultValue: "No featured meals found." })}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {order.map((id, index) => {
                  const meal = featuredMeals.find((m) => m.id === id);
                  if (!meal) return null;
                  return <SortableMealRow key={id} meal={meal} index={index} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges || saving || loading}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              cursor: !hasChanges || saving || loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {t("admin.featuredMealsOrdering.reset", { defaultValue: "Reset" })}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving || loading || featuredMeals.length === 0}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #ec4899",
              backgroundColor: "#ec4899",
              color: "#ffffff",
              cursor: !hasChanges || saving || loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {saving
              ? t("admin.featuredMealsOrdering.saving", { defaultValue: "Saving..." })
              : t("admin.featuredMealsOrdering.save", { defaultValue: "Save" })}
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};
export function FeaturedMealsOrderingWithBoundary() {
  return (
    <FeaturedMealsOrderingErrorBoundary>
      <FeaturedMealsOrdering />
    </FeaturedMealsOrderingErrorBoundary>
  );
}

export default FeaturedMealsOrderingWithBoundary;
