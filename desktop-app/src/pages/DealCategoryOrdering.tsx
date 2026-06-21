import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { categoryService, type Category } from "../services/categoryService";
import PageHeader from "../components/PageHeader";
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
import { ChevronLeft, GripVertical, RefreshCw, Star } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const FALLBACK_CATEGORY_IMAGE = "https://placehold.co/120x120?text=Cat";

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
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
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        backgroundColor: "#ffffff",
        padding: "12px",
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

        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, overflow: "hidden", backgroundColor: "#f3f4f6", flexShrink: 0 }}>
            <img
              src={imageSrc}
              alt={category.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_CATEGORY_IMAGE;
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
              {category.name}
            </div>
            {helperText ? (
              <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>{helperText}</div>
            ) : category.description ? (
              <div
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {category.description}
              </div>
            ) : null}
          </div>
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

const DealCategoryOrdering: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const navigate = useNavigate();

  const canOrdering = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING }]);
  const canDisplayPriority = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.DISPLAY_PRIORITY }]);

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
      activationConstraint: { distance: 6 },
    })
  );

  const dealCategories = useMemo(
    () => (orderingCategories || []).filter((c) => (c?._count?.deals ?? 0) > 0),
    [orderingCategories]
  );

  const categoryDictionary = useMemo(() => {
    const map: Record<string, Category> = {};
    dealCategories.forEach((category) => {
      map[category.id] = category;
    });
    return map;
  }, [dealCategories]);

  const sortByOrder = useCallback((data: Category[], field: "featuredOrder" | "listOrder") => {
    return [...data].sort((a, b) => {
      const orderA = typeof (a as any)[field] === "number" && (a as any)[field] > 0 ? (a as any)[field] : Number.MAX_SAFE_INTEGER;
      const orderB = typeof (b as any)[field] === "number" && (b as any)[field] > 0 ? (b as any)[field] : Number.MAX_SAFE_INTEGER;

      if (orderA === orderB) {
        return a.name.localeCompare(b.name);
      }
      return orderA - orderB;
    });
  }, []);

  const featuredItems = useMemo(() => {
    return featuredOrder.map((id) => categoryDictionary[id]).filter(Boolean) as Category[];
  }, [featuredOrder, categoryDictionary]);

  const listItems = useMemo(() => {
    return listOrder.map((id) => categoryDictionary[id]).filter(Boolean) as Category[];
  }, [listOrder, categoryDictionary]);

  const featuredHasChanges = useMemo(
    () => !arraysEqual(featuredOrder, initialFeaturedOrder),
    [featuredOrder, initialFeaturedOrder]
  );
  const listHasChanges = useMemo(
    () => !arraysEqual(listOrder, initialListOrder),
    [listOrder, initialListOrder]
  );

  const loadOrderingCategories = useCallback(async () => {
    try {
      setOrderingLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(1, 1000, "", "listOrder", "asc", token || undefined);
      setOrderingCategories(response.categories || []);
    } catch (error) {
      console.error("Error loading deal category ordering:", error);
      alert(t("admin.dealCategoryOrdering.loadError"));
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
      if (type === "featured") setFeaturedOrder(initialFeaturedOrder.slice());
      else setListOrder(initialListOrder.slice());
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
        const payload = orderSource.map((id, index) => ({ id, order: index + 1 }));

        await categoryService.reorderCategories(type, payload, token || undefined);

        if (type === "featured") setInitialFeaturedOrder(orderSource.slice());
        else setInitialListOrder(orderSource.slice());

        await loadOrderingCategories();
      } catch (error) {
        console.error("Error saving deal category order:", error);
        alert(
          t(
            `admin.dealCategoryOrdering.${
              type === "featured" ? "featuredSaveError" : "listSaveError"
            }`
          )
        );
      } finally {
        if (type === "featured") setIsSavingFeaturedOrder(false);
        else setIsSavingListOrder(false);
      }
    },
    [featuredOrder, getToken, listOrder, loadOrderingCategories, t]
  );

  if (!canOrdering && !canDisplayPriority) {
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
      <div style={{ marginBottom: "18px" }}>
        <PageHeader
          title={t("admin.dealCategoryOrdering.title")}
          description={t("admin.dealCategoryOrdering.description")}
          actions={
            <>
              <button
                type="button"
                onClick={() => navigate("/admin/deals")}
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
                  cursor: "pointer",
                }}
              >
                <ChevronLeft style={{ width: 16, height: 16 }} />
                {t("common.back", { defaultValue: "Back" })}
              </button>

              <button
                type="button"
                onClick={loadOrderingCategories}
                disabled={orderingLoading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #fbcfe8",
                  backgroundColor: "#ffffff",
                  color: "#db2777",
                  fontWeight: 900,
                  cursor: orderingLoading ? "not-allowed" : "pointer",
                  opacity: orderingLoading ? 0.6 : 1,
                }}
              >
                <RefreshCw style={{ width: 16, height: 16, animation: orderingLoading ? "spin 1s linear infinite" : undefined }} />
                {t("common.refresh", { defaultValue: "Refresh" })}
              </button>
            </>
          }
        />
      </div>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px dashed #fbcfe8",
          borderRadius: "16px",
          padding: "16px",
        }}
      >
        <div style={{ fontSize: "14px", fontWeight: 900, color: "#ec4899", marginBottom: "8px" }}>
          {t("admin.dealCategoryOrdering.sectionsTitle")}
        </div>
        <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>
          {t("admin.dealCategoryOrdering.helper")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "14px", backgroundColor: "#f9fafb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 900, color: "#111827" }}>
                  <Star style={{ width: 16, height: 16, color: "#ec4899" }} />
                  {t("admin.dealCategoryOrdering.featuredTitle")}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                  {t("admin.dealCategoryOrdering.featuredDescription")}
                </div>
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 900 }}>
                {t("admin.dealCategoryOrdering.featuredCount", { count: featuredItems.length })}
              </div>
            </div>

            {!canDisplayPriority ? (
              <div style={{ marginTop: "12px", padding: "12px", border: "1px dashed #e5e7eb", borderRadius: "12px", color: "#6b7280", fontSize: "13px", textAlign: "center" }}>
                {t("common.accessDenied", { defaultValue: "Access is denied" })}
              </div>
            ) : orderingLoading ? (
              <div style={{ marginTop: "12px", color: "#6b7280" }}>{t("common.loading")}</div>
            ) : featuredItems.length === 0 ? (
              <div style={{ marginTop: "12px", padding: "12px", border: "1px dashed #e5e7eb", borderRadius: "12px", color: "#6b7280", fontSize: "13px", textAlign: "center" }}>
                {t("admin.dealCategoryOrdering.emptyFeatured")}
              </div>
            ) : (
              <div style={{ marginTop: "12px" }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFeaturedDragEnd}>
                  <SortableContext items={featuredOrder} strategy={verticalListSortingStrategy}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {featuredItems.map((category, index) => (
                        <SortableCategoryItem
                          key={category.id}
                          id={category.id}
                          category={category}
                          index={index}
                          helperText={t("admin.dealCategoryOrdering.featuredHelper", {
                            position: index + 1,
                          })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => handleResetOrder("featured")}
                disabled={!canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  cursor: !canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder ? "not-allowed" : "pointer",
                  opacity: !canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder ? 0.6 : 1,
                  fontWeight: 900,
                }}
              >
                {t("common.reset", { defaultValue: "Reset" })}
              </button>
              <button
                type="button"
                onClick={() => handleSaveOrder("featured")}
                disabled={!canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder || featuredItems.length === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ec4899",
                  backgroundColor: "#ec4899",
                  color: "#ffffff",
                  cursor: !canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder || featuredItems.length === 0 ? "not-allowed" : "pointer",
                  opacity: !canDisplayPriority || !featuredHasChanges || isSavingFeaturedOrder || featuredItems.length === 0 ? 0.6 : 1,
                  fontWeight: 900,
                }}
              >
                {isSavingFeaturedOrder ? t("common.saving", { defaultValue: "Saving..." }) : t("common.save", { defaultValue: "Save" })}
              </button>
            </div>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "14px", backgroundColor: "#f9fafb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <div>
                <div style={{ fontWeight: 900, color: "#111827" }}>{t("admin.dealCategoryOrdering.listTitle")}</div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>{t("admin.dealCategoryOrdering.listDescription")}</div>
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 900 }}>
                {t("admin.dealCategoryOrdering.listCount", { count: listItems.length })}
              </div>
            </div>

            {!canOrdering ? (
              <div style={{ marginTop: "12px", padding: "12px", border: "1px dashed #e5e7eb", borderRadius: "12px", color: "#6b7280", fontSize: "13px", textAlign: "center" }}>
                {t("common.accessDenied", { defaultValue: "Access is denied" })}
              </div>
            ) : orderingLoading ? (
              <div style={{ marginTop: "12px", color: "#6b7280" }}>{t("common.loading")}</div>
            ) : listItems.length === 0 ? (
              <div style={{ marginTop: "12px", padding: "12px", border: "1px dashed #e5e7eb", borderRadius: "12px", color: "#6b7280", fontSize: "13px", textAlign: "center" }}>
                {t("admin.dealCategoryOrdering.emptyList")}
              </div>
            ) : (
              <div style={{ marginTop: "12px" }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleListDragEnd}>
                  <SortableContext items={listOrder} strategy={verticalListSortingStrategy}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {listItems.map((category, index) => (
                        <SortableCategoryItem
                          key={category.id}
                          id={category.id}
                          category={category}
                          index={index}
                          helperText={t("admin.dealCategoryOrdering.listHelper", { position: index + 1 })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => handleResetOrder("list")}
                disabled={!canOrdering || !listHasChanges || isSavingListOrder}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  cursor: !canOrdering || !listHasChanges || isSavingListOrder ? "not-allowed" : "pointer",
                  opacity: !canOrdering || !listHasChanges || isSavingListOrder ? 0.6 : 1,
                  fontWeight: 900,
                }}
              >
                {t("common.reset", { defaultValue: "Reset" })}
              </button>
              <button
                type="button"
                onClick={() => handleSaveOrder("list")}
                disabled={!canOrdering || !listHasChanges || isSavingListOrder || listItems.length === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ec4899",
                  backgroundColor: "#ec4899",
                  color: "#ffffff",
                  cursor: !canOrdering || !listHasChanges || isSavingListOrder || listItems.length === 0 ? "not-allowed" : "pointer",
                  opacity: !canOrdering || !listHasChanges || isSavingListOrder || listItems.length === 0 ? 0.6 : 1,
                  fontWeight: 900,
                }}
              >
                {isSavingListOrder ? t("common.saving", { defaultValue: "Saving..." }) : t("common.save", { defaultValue: "Save" })}
              </button>
            </div>
          </div>
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

export default DealCategoryOrdering;
