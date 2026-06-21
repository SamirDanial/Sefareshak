import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { ArrowLeft, GripVertical, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { categoryService, type Category } from "../services/categoryService";
import { mealService, type Meal } from "../services/mealService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const isExternalImage = (url: string): boolean => {
  return url.startsWith("http://") || url.startsWith("https://");
};

const getOptimizedImageUrl = (imagePath: string | null): string => {
  if (!imagePath) return "";
  if (isExternalImage(imagePath)) return imagePath;
  if (imagePath.startsWith("/uploads/images/")) {
    const filename = imagePath.replace("/uploads/images/", "");
    return `${API_BASE_URL}/uploads/images/${filename}`;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

const SortableMealRow: React.FC<{ meal: Meal; index: number }> = ({ meal, index }) => {
  const { t } = useTranslation();
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
              {t("admin.categoryMealOrdering.noImage", { defaultValue: "No image" })}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827" }}>{meal.name}</div>
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

const CategoryMealOrdering: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny } = usePermissions();

  const canReorderCategoryMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_CATEGORY },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_CATEGORY },
  ]);

  const [category, setCategory] = useState<Category | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
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

  const loadCategoryMeals = useCallback(async () => {
    if (!categoryId) return;
    try {
      setLoading(true);
      const token = await getToken();
      const [categoryResponse, mealsResponse] = await Promise.all([
        categoryService.getCategoryById(categoryId, token || undefined),
        mealService.getMeals(1, 200, "", "listOrder", "asc", categoryId, token || undefined),
      ]);

      setCategory(categoryResponse);
      const categoryMeals = mealsResponse.meals || [];
      setMeals(categoryMeals);
      const ids = categoryMeals.map((meal) => meal.id);
      setOrder(ids);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading category meals for ordering:", error);
      alert(
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

  const handleReset = () => {
    setOrder(initialOrder.slice());
    setMeals((items) => {
      const map = new Map(items.map((meal) => [meal.id, meal]));
      return initialOrder.map((id) => map.get(id)!).filter(Boolean);
    });
  };

  const handleSave = async () => {
    if (!categoryId) return;
    try {
      setSaving(true);
      const token = await getToken();
      const payload = order.map((id, index) => ({ id, order: index + 1 }));
      await mealService.reorderCategoryMeals(categoryId, payload, token || undefined);
      setInitialOrder(order.slice());
      await loadCategoryMeals();
    } catch (error) {
      console.error("Error saving category meal order:", error);
      alert(
        t("admin.categoryMealOrdering.saveError", {
          defaultValue: "Failed to save meal order.",
        })
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canReorderCategoryMeals) {
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
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#111827" }}>
            {t("admin.categoryMealOrdering.title", {
              defaultValue: "Reorder meals",
            })}
          </h2>
          <p style={{ margin: 0, marginTop: "6px", color: "#6b7280", fontSize: "14px" }}>
            {(category?.name || "") + (category?.description ? ` — ${category.description}` : "")}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link
            to={`/admin/menu/${categoryId || ""}`}
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
            onClick={loadCategoryMeals}
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
            {t("admin.categoryMealOrdering.refresh", { defaultValue: "Refresh" })}
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
            {t("admin.categoryMealOrdering.loading", { defaultValue: "Loading..." })}
          </div>
        ) : meals.length === 0 ? (
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
            {t("admin.categoryMealOrdering.empty", { defaultValue: "No meals found in this category." })}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {order.map((id, index) => {
                  const meal = meals.find((m) => m.id === id);
                  if (!meal) return null;
                  return <SortableMealRow key={id} meal={meal} index={index} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
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
            {t("admin.categoryMealOrdering.reset", { defaultValue: "Reset" })}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving || loading || meals.length === 0}
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
              ? t("admin.categoryMealOrdering.saving", { defaultValue: "Saving..." })
              : t("admin.categoryMealOrdering.save", { defaultValue: "Save" })}
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

export default CategoryMealOrdering;
