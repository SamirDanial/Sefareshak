import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { categoryService, type Category } from "../services/categoryService";
import { dealService, type Deal } from "../services/dealService";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, Loader2, RefreshCw, GripVertical } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const FALLBACK_DEAL_IMAGE = "https://placehold.co/160x160?text=Deal";

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

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const SortableDealRow: React.FC<{ deal: Deal; index: number }> = ({ deal, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px",
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        backgroundColor: "#ffffff",
        boxShadow: isDragging ? "0 10px 25px rgba(0,0,0,0.12)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <button
          type="button"
          style={{
            border: "none",
            backgroundColor: "transparent",
            cursor: "grab",
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
          }}
          {...attributes}
          {...listeners}
        >
          <GripVertical style={{ width: 18, height: 18 }} />
        </button>

        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: "#f3f4f6",
            flexShrink: 0,
          }}
        >
          <img
            src={
              deal.image
                ? isExternalImage(deal.image)
                  ? deal.image
                  : getOptimizedImageUrl(deal.image)
                : FALLBACK_DEAL_IMAGE
            }
            alt={deal.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_DEAL_IMAGE;
              (e.currentTarget as HTMLImageElement).onerror = null;
            }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 900,
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {deal.name}
          </div>
          {deal.description ? (
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {deal.description}
            </div>
          ) : null}
        </div>
      </div>

      <span
        style={{
          fontSize: "12px",
          fontWeight: 900,
          color: "#6b7280",
          padding: "6px 10px",
          borderRadius: "999px",
          backgroundColor: "#f3f4f6",
          flexShrink: 0,
        }}
      >
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

  const canReorderCategoryDeals = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY }]);

  const [category, setCategory] = useState<Category | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
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
      alert(t("admin.categoryDealOrdering.loadError"));
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
      const payload = order.map((id, index) => ({ id, order: index + 1 }));
      await dealService.reorderCategoryDeals(categoryId, payload, token || undefined);
      alert(t("admin.categoryDealOrdering.saveSuccess"));
      setInitialOrder(order.slice());
      await loadCategoryDeals();
    } catch (error) {
      console.error("Error saving category deal order:", error);
      alert(t("admin.categoryDealOrdering.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!canReorderCategoryDeals) {
    return (
      <div style={{ padding: "24px" }}>
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "18px" }}>
        <div>
          <button
            type="button"
            onClick={() => {
              navigate(`/admin/deals?categoryId=${categoryId || ""}`);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: 0,
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
              color: "#6b7280",
              fontWeight: 800,
              marginBottom: "10px",
            }}
          >
            <ChevronLeft style={{ width: 16, height: 16 }} />
            {t("common.back", { defaultValue: "Back" })}
          </button>

          <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#ec4899", margin: 0 }}>
            {t("admin.categoryDealOrdering.title", {
              category: category?.name || t("admin.categoryDealOrdering.categoryNotFound"),
            })}
          </h2>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "8px 0 0 0" }}>
            {t("admin.categoryDealOrdering.description")}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={loadCategoryDeals}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              color: "#111827",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            <RefreshCw style={{ width: 16, height: 16, color: "#6b7280", animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </button>

          <button
            type="button"
            onClick={() => {
              setOrder(initialOrder.slice());
              setDeals((items) => {
                const map = new Map(items.map((d) => [d.id, d]));
                return initialOrder.map((id) => map.get(id)).filter(Boolean) as Deal[];
              });
            }}
            disabled={!hasChanges || saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              color: "#111827",
              fontWeight: 800,
              cursor: !hasChanges || saving ? "not-allowed" : "pointer",
              opacity: !hasChanges || saving ? 0.5 : 1,
            }}
          >
            {t("common.reset", { defaultValue: "Reset" })}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving || deals.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #ec4899",
              backgroundColor: "#ec4899",
              color: "#ffffff",
              fontWeight: 900,
              cursor: !hasChanges || saving || deals.length === 0 ? "not-allowed" : "pointer",
              opacity: !hasChanges || saving || deals.length === 0 ? 0.6 : 1,
            }}
          >
            {saving ? (
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            ) : (
              <GripVertical style={{ width: 16, height: 16 }} />
            )}
            {saving ? t("common.saving", { defaultValue: "Saving..." }) : t("common.save", { defaultValue: "Save" })}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#ec4899", fontWeight: 900 }}>
            <RefreshCw style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
            {t("common.loading")}
          </div>
        </div>
      ) : deals.length === 0 ? (
        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            {t("admin.categoryDealOrdering.emptyTitle")}
          </p>
          <p style={{ margin: "10px 0 0 0", color: "#6b7280", fontSize: "13px" }}>
            {t("admin.categoryDealOrdering.emptyDescription")}
          </p>
          <button
            type="button"
            onClick={() => navigate("/admin/deals")}
            style={{
              marginTop: "16px",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {t("admin.categoryDealOrdering.manageDeals")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827" }}>
            {t("admin.categoryDealOrdering.listTitle", { count: deals.length })}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280" }}>{t("admin.categoryDealOrdering.helper")}</div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {deals.map((deal, index) => (
                  <SortableDealRow key={deal.id} deal={deal} index={index} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

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

export default CategoryDealOrdering;
