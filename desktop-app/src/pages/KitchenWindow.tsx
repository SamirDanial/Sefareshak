import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { AdminWebSocketProvider, useAdminWebSocket } from "../contexts/AdminWebSocketContext";
import branchService from "../services/branchService";
import { orderService, type Order } from "../services/orderService";
import { kitchenTicketService, type KitchenTicket, type KitchenTicketStatus } from "../services/kitchenTicketService";
import { reservationService, type Reservation } from "../services/reservationService";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { toast } from "../components/Toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type TabKey = "DELIVERY" | "PICKUP" | "RESERVATION";

type MergeNotice = {
  orderId: string;
  createdAt: number;
  newItems: any[];
};

type Department = "KITCHEN" | "BAR";

const DepartmentContext = React.createContext<Department>("KITCHEN");

const useDepartment = (): Department => {
  return useContext(DepartmentContext);
};

const isDepartmentResponsibleForItem = (department: Department, isDrink: boolean | null | undefined): boolean => {
  if (department === "BAR") return Boolean(isDrink);
  return isDrink === false;
};

const isDepartmentResponsibleForTicketItem = (
  department: Department,
  ticketSource: string | null | undefined,
  itemIsDrink: boolean | null | undefined
): boolean => {
  if (typeof itemIsDrink === "boolean") {
    return isDepartmentResponsibleForItem(department, itemIsDrink);
  }
  const src = String(ticketSource || "").trim().toLowerCase();
  const inferredIsDrink = src.startsWith("bar_");
  return isDepartmentResponsibleForItem(department, inferredIsDrink);
};

const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const parseTimezoneOffsetMinutes = (raw: string): number => {
  const val = String(raw || "").trim();
  if (!val) return 5 * 60;

  if (/^[+-]?\d+$/.test(val)) {
    const hours = parseInt(val, 10);
    return Number.isFinite(hours) ? hours * 60 : 5 * 60;
  }

  const m = val.match(/^([+-])?(\d{1,2}):(\d{2})$/);
  if (!m) return 5 * 60;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = parseInt(m[2], 10);
  const mm = parseInt(m[3], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 5 * 60;
  return sign * (hh * 60 + mm);
};

const getRestaurantTimezoneOffsetMinutes = (): number => {
  const raw = (import.meta as any)?.env?.VITE_RESTAURANT_TIMEZONE_OFFSET;
  return parseTimezoneOffsetMinutes(String(raw || ""));
};

const getTodayKeyInRestaurantTz = (): string => {
  const offsetMinutes = getRestaurantTimezoneOffsetMinutes();
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tzMs = utcMs + offsetMinutes * 60_000;
  const d = new Date(tzMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getNowInRestaurantTz = (): Date => {
  const offsetMinutes = getRestaurantTimezoneOffsetMinutes();
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tzMs = utcMs + offsetMinutes * 60_000;
  return new Date(tzMs);
};

const getDateInRestaurantTz = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const offsetMinutes = getRestaurantTimezoneOffsetMinutes();
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000;
  const tzMs = utcMs + offsetMinutes * 60_000;
  return new Date(tzMs);
};

const getDateKeyInRestaurantTz = (d: Date): string => {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatTimeHHmm = (d: Date): string => {
  try {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
};

const isWithinOneHourTo = (target: Date | null): boolean => {
  if (!target) return false;
  const nowTz = getNowInRestaurantTz();
  const diffMs = target.getTime() - nowTz.getTime();
  const oneHourMs = 60 * 60_000;
  return diffMs <= oneHourMs;
};

const isOrderDone = (order: any): boolean => {
  const s = String(order?.status || "").trim().toUpperCase();
  return ["DELIVERED", "PICKED_UP", "CANCELLED", "CANCELED", "COMPLETED"].includes(s);
};

const orderHasDrinkItems = (order: any): boolean => {
  const items = Array.isArray(order?.orderItems) ? order.orderItems : [];
  return items.some((it: any) => Boolean(it?.meal?.isDrink));
};

const reservationHasDrinkItems = (reservation: any): boolean => {
  const orderItems = (reservation as any)?.reservationOrder?.items;
  const items = Array.isArray(orderItems) ? orderItems : [];
  return items.some((it: any) => Boolean(it?.meal?.isDrink));
};

const isReservationDone = (reservation: any): boolean => {
  if (reservation?.noShow === true) return true;
  const s = String(reservation?.status || "").trim().toUpperCase();
  return ["COMPLETED", "CANCELLED", "CANCELED", "NO_SHOW", "NOSHOW"].includes(s);
};

const getBranchIdFromPayload = (payload: any): string => {
  const p = payload?.order || payload?.reservation || payload?.ticket || payload;
  const bId = p?.branchId || p?.branch?.id;
  return String(bId || "");
};

const Badge: React.FC<{ count: number }> = ({ count }) => {
  if (!count || count <= 0) return null;
  const txt = count > 99 ? "99+" : String(count);
  return (
    <span
      style={{
        marginLeft: 10,
        padding: "2px 8px",
        borderRadius: 999,
        background: "#111827",
        color: "#ffffff",
        fontSize: 12,
        fontWeight: 900,
        lineHeight: "18px",
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
      }}
    >
      {txt}
    </span>
  );
};

const DeliveryOrdersList: React.FC<{
  branchId: string;
  onCountChange?: (count: number) => void;
  highlightedOrderId?: string | null;
  onToggleHighlightOrderId?: (orderId: string) => void;
  mergeNotices?: Record<string, MergeNotice>;
  mergePulse?: Record<string, number>;
  onAcknowledgeMerge?: (orderId: string) => void;
}> = ({ branchId, onCountChange, highlightedOrderId, onToggleHighlightOrderId, mergeNotices, mergePulse, onAcknowledgeMerge }) => {
  const department = useDepartment();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [creatingTicketForOrderId, setCreatingTicketForOrderId] = useState<string | null>(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [tooEarlyDialogOpen, setTooEarlyDialogOpen] = useState(false);
  const [tooEarlyDialogText, setTooEarlyDialogText] = useState<{ title: string; description: string } | null>(null);
  const tooEarlyDialogResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const latestFetchRef = useRef(0);

  const todayKey = useMemo(() => getTodayKeyInRestaurantTz(), []);

  const normalizeTicketPayload = (raw: any): any => {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  };

  const showTooEarlyDialog = async (params: { title: string; description: string }): Promise<boolean> => {
    setTooEarlyDialogText(params);
    setTooEarlyDialogOpen(true);
    return await new Promise<boolean>((resolve) => {
      tooEarlyDialogResolveRef.current = resolve;
    });
  };

  const isOrderTodayForDeliveryQueue = (o: any): boolean => {
    const isScheduled = Boolean(o?.isScheduledOrder && o?.scheduledDate);
    if (isScheduled) {
      const d = getDateInRestaurantTz(String(o?.scheduledDate || ""));
      if (!d) return false;
      const key = getDateKeyInRestaurantTz(d);
      return key === todayKey;
    }
    return true;
  };

  const loadOrders = async () => {
    const now = Date.now();
    latestFetchRef.current = now;
    try {
      setLoading(true);
      const token = (await getToken()) || undefined;

      const asapPromise = orderService.getOrders(
        1,
        200,
        "",
        "createdAt",
        "desc",
        "",
        "",
        "",
        todayKey,
        todayKey,
        branchId,
        "",
        "DELIVERY",
        "asap",
        "all",
        "",
        token
      );

      const scheduledPromise = orderService.getOrders(
        1,
        200,
        "",
        "scheduledDate",
        "asc",
        "",
        "",
        "",
        undefined,
        undefined,
        branchId,
        "",
        "DELIVERY",
        "scheduled",
        "all",
        "",
        token
      );

      const [asapResp, scheduledResp] = await Promise.all([asapPromise, scheduledPromise]);
      if (latestFetchRef.current !== now) return;

      const normalizedAsap = Array.isArray(asapResp?.orders) ? asapResp.orders : [];
      const normalizedScheduled = Array.isArray(scheduledResp?.orders) ? scheduledResp.orders : [];
      const combined = [...normalizedAsap, ...normalizedScheduled];

      const byId = new Map<string, any>();
      for (const o of combined) {
        if (!o?.id) continue;
        if (!byId.has(o.id)) byId.set(o.id, o);
      }
      const merged = Array.from(byId.values());

      const active = merged
        .filter((o: any) => !isOrderDone(o))
        .filter((o: any) => isOrderTodayForDeliveryQueue(o))
        .filter((o: any) => (department === "BAR" ? orderHasDrinkItems(o) : true));

      active.sort((a: any, b: any) => {
        const aIsScheduled = Boolean(a?.isScheduledOrder && a?.scheduledDate);
        const bIsScheduled = Boolean(b?.isScheduledOrder && b?.scheduledDate);
        if (aIsScheduled && bIsScheduled) {
          const at = new Date(String(a?.scheduledDate || 0)).getTime();
          const bt = new Date(String(b?.scheduledDate || 0)).getTime();
          return at - bt;
        }
        if (aIsScheduled !== bIsScheduled) return aIsScheduled ? 1 : -1;
        const at = new Date(String(a?.createdAt || 0)).getTime();
        const bt = new Date(String(b?.createdAt || 0)).getTime();
        return bt - at;
      });

      setOrders(active);
      onCountChange?.(active.length);
    } catch {
      if (latestFetchRef.current !== now) return;
      setOrders([]);
      onCountChange?.(0);
    } finally {
      if (latestFetchRef.current !== now) return;
      setLoading(false);
    }
  };

  const loadTickets = async () => {
    try {
      setTicketLoading(true);
      const token = await getToken();
      if (!token) {
        setTickets([]);
        return;
      }
      const list = await kitchenTicketService.listKitchenTickets({ branchId, date: todayKey }, token);
      const expectedSource = department === "BAR" ? "bar_delivery" : "delivery";
      const filtered = Array.isArray(list)
        ? list.filter((t: any) => {
            const payload = normalizeTicketPayload((t as any)?.items);
            return String(payload?.source || "").trim().toLowerCase() === expectedSource;
          })
        : [];
      setTickets(filtered);
    } catch {
      setTickets([]);
    } finally {
      setTicketLoading(false);
    }
  };

  useEffect(() => {
    if (!branchId) return;
    void loadOrders();
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const matchesBranch = (payload: any): boolean => {
      const order = payload?.order || payload;
      const bId = order?.branch?.id || order?.branchId;
      return bId && String(bId) === String(branchId);
    };
    const unsubNew = subscribe("new-order", (payload: any) => {
      if (!matchesBranch(payload)) return;
      const o = payload?.order;
      if (String(o?.orderType || "") !== "DELIVERY") return;
      void loadOrders();
    });
    const unsubUpd = subscribe("order-updated", (payload: any) => {
      if (!matchesBranch(payload)) return;
      const o = payload?.order;
      if (String(o?.orderType || "") !== "DELIVERY") return;
      void loadOrders();
    });
    const unsubTicketCreated = subscribe("kitchen-ticket-created", (payload: any) => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      if (!bId || String(bId) !== String(branchId)) return;
      void loadTickets();
    });
    const unsubTicketUpdated = subscribe("kitchen-ticket-updated", (payload: any) => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      if (!bId || String(bId) !== String(branchId)) return;
      void loadTickets();
    });
    return () => {
      unsubNew();
      unsubUpd();
      unsubTicketCreated();
      unsubTicketUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  const ticketsByOrderId = useMemo(() => {
    const map = new Map<string, KitchenTicket>();
    for (const t of tickets) {
      const payload = normalizeTicketPayload((t as any)?.items);
      const orderId = String(payload?.orderId || "").trim();
      if (!orderId) continue;
      if (!map.has(orderId)) {
        map.set(orderId, t);
        continue;
      }
      const prev = map.get(orderId) as any;
      const pt = new Date(String(prev?.createdAt || 0)).getTime();
      const nt = new Date(String((t as any)?.createdAt || 0)).getTime();
      if (nt > pt) map.set(orderId, t);
    }
    return map;
  }, [tickets]);

  const sendToKitchen = async (order: Order) => {
    try {
      const statusRaw = String((order as any)?.status || "").trim().toUpperCase();
      if (statusRaw !== "CONFIRMED") {
        toast.warning("Order must be CONFIRMED to send to kitchen.");
        return;
      }

      const isScheduled = Boolean((order as any)?.isScheduledOrder && (order as any)?.scheduledDate);
      if (isScheduled) {
        const nowTz = getNowInRestaurantTz();
        const scheduledTz = getDateInRestaurantTz(String((order as any)?.scheduledDate || ""));
        if (scheduledTz) {
          const diffMs = scheduledTz.getTime() - nowTz.getTime();
          const oneHourMs = 60 * 60_000;
          if (diffMs > oneHourMs) {
            const nowText = formatTimeHHmm(nowTz);
            const schText = formatTimeHHmm(scheduledTz);
            const ok = await showTooEarlyDialog({
              title: "Prepare delivery early?",
              description: `This delivery is scheduled for ${schText}. Current time is ${nowText}. Are you sure you want to prepare it now?`,
            });
            if (!ok) return;
          }
        }
      }

      if (ticketsByOrderId.has(order.id)) {
        toast.info("Kitchen ticket already exists for this order.");
        return;
      }
      setCreatingTicketForOrderId(order.id);
      const token = await getToken();
      if (!token) return;

      const allowedItems = Array.isArray(order.orderItems)
        ? order.orderItems.filter((it: any) => (department === "BAR" ? Boolean(it?.meal?.isDrink) : !Boolean(it?.meal?.isDrink)))
        : [];

      const mappedItems = Array.isArray(allowedItems)
        ? allowedItems.map((it: any) => ({
            id: it?.id,
            name: it?.meal?.name,
            isDrink: (it as any)?.meal?.isDrink,
            qty: it?.quantity,
            selectedSize: it?.selectedSize,
            notes: it?.specialInstructions || undefined,
            addons: Array.isArray(it?.orderItemAddOns)
              ? it.orderItemAddOns.map((a: any) => ({
                  name: a?.addOnName,
                  qty: a?.quantity,
                }))
              : [],
            optionalIngredients: Array.isArray(it?.orderItemOptionalIngredients)
              ? it.orderItemOptionalIngredients.map((o: any) => ({
                  name: o?.ingredientName,
                  isIncluded: o?.isIncluded,
                }))
              : [],
          }))
        : [];

      if (!mappedItems || mappedItems.length === 0) {
        toast.info(department === "BAR" ? "No drink items to send to Bar." : "No food items to send to Kitchen.");
        return;
      }

      const payload = {
        source: department === "BAR" ? "bar_delivery" : "delivery",
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId,
        items: mappedItems,
      };

      await kitchenTicketService.createKitchenTicket({ branchId, reservationId: null, items: payload }, token);
    } catch (e) {
      console.error("Failed to create kitchen ticket for delivery order:", e);
      toast.error("Failed to create kitchen ticket");
    } finally {
      setCreatingTicketForOrderId(null);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <Dialog
        open={tooEarlyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTooEarlyDialogOpen(false);
            setTooEarlyDialogText(null);
            const resolve = tooEarlyDialogResolveRef.current;
            tooEarlyDialogResolveRef.current = null;
            resolve?.(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tooEarlyDialogText?.title || "Confirm"}</DialogTitle>
            <DialogDescription>{tooEarlyDialogText?.description || ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTooEarlyDialogOpen(false);
                setTooEarlyDialogText(null);
                const resolve = tooEarlyDialogResolveRef.current;
                tooEarlyDialogResolveRef.current = null;
                resolve?.(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setTooEarlyDialogOpen(false);
                setTooEarlyDialogText(null);
                const resolve = tooEarlyDialogResolveRef.current;
                tooEarlyDialogResolveRef.current = null;
                resolve?.(true);
              }}
            >
              Prepare now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 40 }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>Delivery orders</div>
        <button
          type="button"
          onClick={() => {
            void loadOrders();
            void loadTickets();
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ padding: 14, borderRadius: 12, border: "1px dashed #e5e7eb", background: "#fff", color: "#6b7280" }}>
          No delivery orders for today.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {orders.map((o) => {
            const t = ticketsByOrderId.get(o.id);
            const expanded = !!expandedOrderIds[o.id];
            const itemCount = Array.isArray((o as any)?.orderItems) ? (o as any).orderItems.length : 0;
            const statusRaw = String((o as any)?.status || "").trim().toUpperCase();
            const canCreateTicket = statusRaw === "CONFIRMED";
            const isScheduled = Boolean((o as any)?.isScheduledOrder && (o as any)?.scheduledDate);
            const scheduledTz = isScheduled ? getDateInRestaurantTz(String((o as any)?.scheduledDate || "")) : null;
            const canPrep = isScheduled ? isWithinOneHourTo(scheduledTz) : false;
            const isHighlighted = Boolean(highlightedOrderId && String(highlightedOrderId) === String(o.id));
            const mergeNotice = mergeNotices?.[String(o.id)];
            const isMergePulsing = Boolean(mergePulse?.[String(o.id)]);
            return (
              <div
                key={o.id}
                id={`kitchen-order-${o.id}`}
                onClick={() => onToggleHighlightOrderId?.(String(o.id))}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: isMergePulsing ? "#fffbeb" : "#ffffff",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  minWidth: 0,
                  boxShadow: isHighlighted ? "0 0 0 2px rgba(17,24,39,0.25)" : undefined,
                  borderColor: isHighlighted ? "#111827" : isMergePulsing ? "#f59e0b" : "#e5e7eb",
                  cursor: onToggleHighlightOrderId ? "pointer" : undefined,
                  transition: "background 250ms ease, border-color 250ms ease",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: "#111827" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: getDeliveryAccentColor(o.id),
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    #{o.orderNumber}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{o.deliveryPhone ? `Phone: ${o.deliveryPhone}` : ""}</div>
                  {o.deliveryAddress ? <div style={{ fontSize: 12, color: "#6b7280" }}>Address: {o.deliveryAddress}</div> : null}
                  {o.deliveryNotes ? <div style={{ fontSize: 12, color: "#6b7280" }}>Notes: {o.deliveryNotes}</div> : null}
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                    {ticketLoading ? "Loading ticket…" : t ? `Ticket: ${t.status}` : "No ticket"}
                  </div>

                  {mergeNotice ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid #f59e0b",
                        background: "#fffbeb",
                        color: "#92400e",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 950 }}>Merged update received</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309" }}>
                        Added items: {Array.isArray(mergeNotice.newItems) ? mergeNotice.newItems.length : 0}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcknowledgeMerge?.(String(o.id));
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #92400e",
                            background: "#fff",
                            color: "#92400e",
                            cursor: "pointer",
                            fontWeight: 950,
                            fontSize: 12,
                          }}
                        >
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {mergeNotice ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid #f59e0b",
                        background: "#fffbeb",
                        color: "#92400e",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 950 }}>Merged update received</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309" }}>
                        Added items: {Array.isArray(mergeNotice.newItems) ? mergeNotice.newItems.length : 0}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcknowledgeMerge?.(String(o.id));
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #92400e",
                            background: "#fff",
                            color: "#92400e",
                            cursor: "pointer",
                            fontWeight: 950,
                            fontSize: 12,
                          }}
                        >
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#111827", fontWeight: 900 }}>
                        Items
                        <span style={{ marginLeft: 8, color: "#6b7280", fontWeight: 800 }}>{itemCount}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedOrderIds((prev) => ({
                            ...prev,
                            [o.id]: !prev[o.id],
                          }));
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#111827",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 900,
                          padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        {expanded ? "Hide items" : "Show items"}
                      </button>
                    </div>

                    {expanded ? (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: "#f9fafb",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        {(Array.isArray((o as any)?.orderItems) ? (o as any).orderItems : []).map((it: any, idx: number) => {
                          const name = it?.meal?.name || "Item";
                          const qty = typeof it?.quantity === "number" ? it.quantity : 1;
                          const size = String(it?.selectedSize || "").trim();
                          const notes = String(it?.specialInstructions || "").trim();
                          const isDrink = (it as any)?.meal?.isDrink;
                          const isResponsible = isDepartmentResponsibleForItem(department, isDrink);
                          let line = `${qty}x ${name}`;
                          if (size) line += ` (${size})`;
                          if (notes) line += ` — ${notes}`;
                          return (
                            <div
                              key={it?.id || idx}
                              style={{
                                fontSize: 12,
                                color: isResponsible ? "#16a34a" : "#111827",
                                fontWeight: 700,
                                whiteSpace: "normal",
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                              }}
                              title={line}
                            >
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>{o.status}</div>
                  <div style={{ fontSize: 12, color: canPrep ? "#16a34a" : "#6b7280", fontWeight: 900 }}>
                    {isScheduled ? `Scheduled${scheduledTz ? ` • ${formatTimeHHmm(scheduledTz)}` : ""}` : "ASAP"}
                  </div>
                  {!t ? (
                    <button
                      type="button"
                      disabled={!canCreateTicket || creatingTicketForOrderId === o.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void sendToKitchen(o);
                      }}
                      style={{
                        marginTop: 2,
                        padding: "7px 10px",
                        borderRadius: 10,
                        border: "1px solid #111827",
                        background: "#fff",
                        color: "#111827",
                        cursor: !canCreateTicket || creatingTicketForOrderId === o.id ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                        opacity: !canCreateTicket || creatingTicketForOrderId === o.id ? 0.7 : 1,
                      }}
                    >
                      {creatingTicketForOrderId === o.id ? (
                        "Creating…"
                      ) : (
                        <span style={{ display: "inline-block", textAlign: "center", lineHeight: "14px" }}>
                          Create
                          <br />
                          ticket
                        </span>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
const DeliveryTicketsBoard: React.FC<{
  branchId: string;
  highlightedOrderId?: string | null;
  onToggleHighlightOrderId?: (orderId: string) => void;
  mergeNotices?: Record<string, MergeNotice>;
  mergePulse?: Record<string, number>;
  onAcknowledgeMerge?: (orderId: string) => void;
}> = ({ branchId, highlightedOrderId, onToggleHighlightOrderId, mergeNotices, mergePulse, onAcknowledgeMerge }) => {
  const department = useDepartment();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const latestFetchRef = useRef(0);
  const [orderStatusById, setOrderStatusById] = useState<Record<string, string>>({});
  const todayKey = useMemo(() => getTodayKeyInRestaurantTz(), []);

  const normalizeTicketPayload = (raw: any): any => {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  };

  const load = async () => {
    const now = Date.now();
    latestFetchRef.current = now;
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setTickets([]);
        setOrderStatusById({});
        return;
      }
      const [list, ordersResp] = await Promise.all([
        kitchenTicketService.listKitchenTickets({ branchId, date: todayKey }, token),
        orderService.getOrders(
          1,
          250,
          "",
          "createdAt",
          "desc",
          "",
          "",
          "",
          todayKey,
          todayKey,
          branchId,
          "",
          "DELIVERY",
          "all",
          "all",
          "",
          token
        ),
      ]);
      if (latestFetchRef.current !== now) return;
      const expectedSource = department === "BAR" ? "bar_delivery" : "delivery";
      const filtered = Array.isArray(list)
        ? list.filter(
            (t: any) =>
              String(normalizeTicketPayload((t as any)?.items)?.source || "")
                .trim()
                .toLowerCase() === expectedSource
          )
        : [];
      setTickets(filtered);

      const orders = Array.isArray((ordersResp as any)?.orders) ? (ordersResp as any).orders : [];
      const statusMap: Record<string, string> = {};
      for (const o of orders) {
        const id = String((o as any)?.id || "").trim();
        if (!id) continue;
        statusMap[id] = String((o as any)?.status || "").trim().toUpperCase();
      }
      setOrderStatusById(statusMap);
    } catch {
      if (latestFetchRef.current !== now) return;
      setTickets([]);
      setOrderStatusById({});
    } finally {
      if (latestFetchRef.current !== now) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branchId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const matchesBranch = (payload: any): boolean => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      return bId && String(bId) === String(branchId);
    };
    const unsubCreated = subscribe("kitchen-ticket-created", (payload: any) => {
      if (!matchesBranch(payload)) return;
      void load();
    });
    const unsubUpdated = subscribe("kitchen-ticket-updated", (payload: any) => {
      if (!matchesBranch(payload)) return;
      void load();
    });
    return () => {
      unsubCreated();
      unsubUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  useEffect(() => {
    if (!branchId) return;

    const matchesBranch = (payload: any): boolean => {
      const order = payload?.order || payload;
      const bId = order?.branch?.id || order?.branchId;
      return bId && String(bId) === String(branchId);
    };

    const updateStatusFromOrder = (payload: any) => {
      const order = payload?.order || payload;
      if (!order) return;
      if (!matchesBranch(payload)) return;
      if (String(order?.orderType || "").trim().toUpperCase() !== "DELIVERY") return;
      const id = String(order?.id || "").trim();
      if (!id) return;
      const status = String(order?.status || "").trim().toUpperCase();
      setOrderStatusById((prev) => ({ ...prev, [id]: status }));
    };

    const unsubUpdated = subscribe("order-updated", updateStatusFromOrder);
    const unsubStatusChanged = subscribe("order-status-changed", updateStatusFromOrder);
    return () => {
      unsubUpdated();
      unsubStatusChanged();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  type DeliveryBoardColumnKey = KitchenTicketStatus | "DONE";

  const deliveryStatusColumns: Array<{ key: DeliveryBoardColumnKey; title: string }> = useMemo(
    () => [
      { key: "NEW", title: "New" },
      { key: "PREPARING", title: "Preparing" },
      { key: "READY", title: "Ready" },
      { key: "CANCELLED", title: "Aborted" },
      { key: "DONE", title: "Done" },
    ],
    []
  );

  const byStatus = useMemo(() => {
    const map: Record<DeliveryBoardColumnKey, KitchenTicket[]> = {
      NEW: [],
      PREPARING: [],
      READY: [],
      CANCELLED: [],
      DONE: [],
    };

    for (const t of tickets) {
      const payload = normalizeTicketPayload(t.items);
      const orderId = String(payload?.orderId || "").trim();
      const orderStatus = orderId ? String(orderStatusById[orderId] || "").trim().toUpperCase() : "";
      const isDoneOrder = orderStatus === "DELIVERED";
      if (isDoneOrder) {
        map.DONE.push(t);
        continue;
      }

      const s = (t.status || "NEW") as KitchenTicketStatus;
      (map[s] || map.NEW).push(t);
    }
    return map;
  }, [tickets, orderStatusById]);

  const moveStatus = async (ticketId: string, next: KitchenTicketStatus) => {
    try {
      const token = await getToken();
      if (!token) return;
      await kitchenTicketService.updateKitchenTicketStatus({ id: ticketId, status: next }, token);
    } catch (err) {
      console.error("Failed to update delivery kitchen ticket status:", err);
      toast.error("Failed to update ticket status");
    }
  };

  const getTicketTitle = (ticket: KitchenTicket): string => {
    const payload = normalizeTicketPayload(ticket.items);
    const on = payload?.orderNumber ? `#${payload.orderNumber}` : "Order";
    return on;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 40 }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>Delivery tickets</div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px dashed #e5e7eb", background: "#ffffff", color: "#6b7280" }}>
          No delivery tickets for today.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(280px, 1fr))",
            gap: 12,
            width: "100%",
            overflowX: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          {deliveryStatusColumns.map((col) => (
            <div
              key={col.key}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 0,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>{col.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>{byStatus[col.key].length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1, minHeight: 0, paddingRight: 2 }}>
                {byStatus[col.key].map((t) => {
                  const canToPreparing = t.status === "NEW";
                  const canToReady = t.status === "PREPARING";
                  const canAbort = t.status !== "READY" && t.status !== "CANCELLED";
                  const payload = normalizeTicketPayload(t.items);
                  const orderId = String(payload?.orderId || "").trim();
                  const doneOrderStatus = String(orderStatusById[orderId] || "").trim().toUpperCase();
                  const isDone = col.key === "DONE" || doneOrderStatus === "DELIVERED";
                  const isHighlighted = Boolean(highlightedOrderId && orderId && String(highlightedOrderId) === orderId);
                  const mergeNotice = orderId ? mergeNotices?.[orderId] : undefined;
                  const isMergePulsing = Boolean(orderId && mergePulse?.[orderId]);
                  return (
                    <div
                      key={t.id}
                      id={`kitchen-ticket-${t.id}`}
                      onClick={() => {
                        if (!orderId) return;
                        onToggleHighlightOrderId?.(orderId);
                      }}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 12,
                        background: isHighlighted ? "#ffffff" : isMergePulsing ? "#fffbeb" : "#f9fafb",
                        minWidth: 0,
                        boxShadow: isHighlighted ? "0 0 0 2px rgba(17,24,39,0.25)" : undefined,
                        borderColor: isHighlighted ? "#111827" : isMergePulsing ? "#f59e0b" : "#e5e7eb",
                        cursor: onToggleHighlightOrderId && orderId ? "pointer" : undefined,
                        transition: "background 250ms ease, border-color 250ms ease",
                      }}
                    >
                      {mergeNotice ? (
                        <div
                          style={{
                            marginBottom: 10,
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid #f59e0b",
                            background: "#fffbeb",
                            color: "#92400e",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 950 }}>Merged update received</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309" }}>
                            Added items: {Array.isArray(mergeNotice.newItems) ? mergeNotice.newItems.length : 0}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!orderId) return;
                                onAcknowledgeMerge?.(orderId);
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 10,
                                border: "1px solid #92400e",
                                background: "#fff",
                                color: "#92400e",
                                cursor: "pointer",
                                fontWeight: 950,
                                fontSize: 12,
                              }}
                            >
                              Acknowledge
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 900, color: "#111827", minWidth: 0 }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: getDeliveryAccentColor(orderId),
                              marginRight: 8,
                              verticalAlign: "middle",
                            }}
                          />
                          {getTicketTitle(t)}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{t.status}</div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>{orderId ? `Order: ${orderId}` : "Order"}</div>
                      {isDone ? <div style={{ marginTop: 6, fontSize: 12, color: "#16a34a", fontWeight: 900 }}>Done</div> : null}

                      <div style={{ marginTop: 10 }}>
                        {Array.isArray(payload?.items) ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {payload.items.map((it: any, idx: number) => (
                              <div key={it?.id || idx} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: isDepartmentResponsibleForTicketItem(department, payload?.source, it?.isDrink)
                                        ? "#16a34a"
                                        : "#111827",
                                      fontWeight: 900,
                                    }}
                                  >
                                    {String(it?.name || "Item")}
                                  </div>
                                  <div style={{ fontSize: 13, color: "#111827", fontWeight: 900 }}>x{typeof it?.qty === "number" ? it.qty : 1}</div>
                                </div>
                                {it?.notes ? <div style={{ fontSize: 12, color: "#6b7280" }}>{String(it.notes)}</div> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>No items.</div>
                        )}
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {!isDone && canToPreparing ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveStatus(t.id, "PREPARING");
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #111827",
                              background: "#111827",
                              color: "#fff",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            Start preparing
                          </button>
                        ) : null}
                        {!isDone && canToReady ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveStatus(t.id, "READY");
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #111827",
                              background: "#fff",
                              color: "#111827",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            Mark ready
                          </button>
                        ) : null}
                        {!isDone && canAbort ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveStatus(t.id, "CANCELLED");
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #b91c1c",
                              background: "#fff",
                              color: "#b91c1c",
                              cursor: "pointer",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            Abort
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const KitchenDeliveryTab: React.FC<{
  branchId: string;
  onDeliveryCountChange?: (count: number) => void;
  mergeNotices?: Record<string, MergeNotice>;
  mergePulse?: Record<string, number>;
  onAcknowledgeMerge?: (orderId: string) => void;
}> = ({ branchId, onDeliveryCountChange, mergeNotices, mergePulse, onAcknowledgeMerge }) => {
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        gap: 14,
        alignItems: "start",
        width: "100%",
      }}
    >
      <DeliveryOrdersList
        branchId={branchId}
        onCountChange={onDeliveryCountChange}
        highlightedOrderId={highlightedOrderId}
        onToggleHighlightOrderId={(orderId) => setHighlightedOrderId((prev) => (prev === orderId ? null : orderId))}
        mergeNotices={mergeNotices}
        mergePulse={mergePulse}
        onAcknowledgeMerge={onAcknowledgeMerge}
      />
      <DeliveryTicketsBoard
        branchId={branchId}
        highlightedOrderId={highlightedOrderId}
        onToggleHighlightOrderId={(orderId) => setHighlightedOrderId((prev) => (prev === orderId ? null : orderId))}
        mergeNotices={mergeNotices}
        mergePulse={mergePulse}
        onAcknowledgeMerge={onAcknowledgeMerge}
      />
    </div>
  );
};

const RESERVATION_COLOR_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#dc2626", // red
  "#7c3aed", // violet
  "#ea580c", // orange
  "#0891b2", // cyan
  "#db2777", // pink
  "#4b5563", // gray
] as const;

const hashStringToIndex = (s: string, mod: number): number => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return mod > 0 ? h % mod : 0;
};

const getReservationAccentColor = (reservationId: string | null | undefined): string => {
  const key = String(reservationId || "").trim();
  if (!key) return "#e5e7eb";
  const idx = hashStringToIndex(key, RESERVATION_COLOR_PALETTE.length);
  return RESERVATION_COLOR_PALETTE[idx] as string;
};

const getPickupAccentColor = (orderId: string | null | undefined): string => {
  const key = String(orderId || "").trim();
  if (!key) return "#e5e7eb";
  const idx = hashStringToIndex(key, RESERVATION_COLOR_PALETTE.length);
  return RESERVATION_COLOR_PALETTE[idx] as string;
};

const getDeliveryAccentColor = (orderId: string | null | undefined): string => {
  const key = String(orderId || "").trim();
  if (!key) return "#e5e7eb";
  const idx = hashStringToIndex(key, RESERVATION_COLOR_PALETTE.length);
  return RESERVATION_COLOR_PALETTE[idx] as string;
};

const TabButton: React.FC<{
  active: boolean;
  title: string;
  onClick: () => void;
}> = ({ active, title, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        backgroundColor: active ? "#111827" : "#ffffff",
        color: active ? "#ffffff" : "#111827",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {title}
    </button>
  );
};

const KitchenReservationsList: React.FC<{ branchId: string; onCountChange?: (count: number) => void }> = ({
  branchId,
  onCountChange,
}) => {
  const department = useDepartment();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingForReservationId, setCreatingForReservationId] = useState<string | null>(null);
  const [expandedReservationIds, setExpandedReservationIds] = useState<Record<string, boolean>>({});
  const [tooEarlyDialogOpen, setTooEarlyDialogOpen] = useState(false);
  const [tooEarlyDialogText, setTooEarlyDialogText] = useState<{ title: string; description: string } | null>(null);
  const tooEarlyDialogResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const latestFetchRef = useRef(0);

  const todayKey = useMemo(() => {
    return getTodayKeyInRestaurantTz();
  }, []);

  const load = async () => {
    const now = Date.now();
    latestFetchRef.current = now;

    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setReservations([]);
        return;
      }

      const resp = await reservationService.getReservations(
        1,
        200,
        {
          branchId,
          date: todayKey,
        },
        token
      );

      if (latestFetchRef.current !== now) return;
      const list = (resp as any)?.data?.reservations;
      const normalizedAll = Array.isArray(list) ? list : [];
      const normalized =
        department === "BAR"
          ? normalizedAll.filter((r: any) => {
              const type = String((r as any)?.type || "").trim().toUpperCase();
              if (type !== "PRE_ORDER") return false;
              return reservationHasDrinkItems(r);
            })
          : normalizedAll;
      setReservations(normalized);
      try {
        const unfinished = normalized.filter((r: any) => !isReservationDone(r)).length;
        onCountChange?.(unfinished);
      } catch {
        onCountChange?.(0);
      }
    } catch {
      if (latestFetchRef.current !== now) return;
      setReservations([]);
      onCountChange?.(0);
    } finally {
      if (latestFetchRef.current !== now) return;
      setLoading(false);
    }
  };

  const activeReservations = useMemo(() => {
    return reservations.filter((r: any) => !isReservationDone(r));
  }, [reservations]);

  const prioritized = useMemo(() => {
    const nowTz = getNowInRestaurantTz();

    const getMinutesTo = (r: any): number => {
      const dt = getDateInRestaurantTz(r?.reservationDate);
      if (!dt) return Number.POSITIVE_INFINITY;
      return (dt.getTime() - nowTz.getTime()) / 60_000;
    };

    const upcomingConfirmed = activeReservations
      .filter((r: any) => String(r?.status || "").trim().toUpperCase() === "CONFIRMED")
      .slice()
      .sort((a: any, b: any) => {
        const am = getMinutesTo(a);
        const bm = getMinutesTo(b);
        if (am !== bm) return am - bm;
        return String(a?.reservationNumber || "").localeCompare(String(b?.reservationNumber || ""));
      });

    const seated = activeReservations
      .filter((r: any) => String(r?.status || "").trim().toUpperCase() === "SEATED")
      .slice()
      .sort((a: any, b: any) => {
        const at = new Date(String(a?.seatedAt || a?.reservationDate || 0)).getTime();
        const bt = new Date(String(b?.seatedAt || b?.reservationDate || 0)).getTime();
        if (at !== bt) return bt - at;
        return String(a?.reservationNumber || "").localeCompare(String(b?.reservationNumber || ""));
      });

    return {
      upcomingConfirmed,
      seated,
    };
  }, [activeReservations]);

  useEffect(() => {
    if (!branchId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;

    const matchesBranch = (reservation: any): boolean => {
      const bId = reservation?.branchId || reservation?.branch?.id;
      if (!bId) return false;
      return String(bId) === String(branchId);
    };

    const onNew = (data: any) => {
      const reservation = data?.reservation;
      if (!reservation) return;
      if (!matchesBranch(reservation)) return;
      void load();
    };

    const onUpdated = (data: any) => {
      const reservation = data?.reservation;
      if (!reservation) return;
      if (!matchesBranch(reservation)) return;
      void load();
    };

    const u1 = subscribe("new-reservation", onNew);
    const u2 = subscribe("reservation-updated", onUpdated);
    const u3 = subscribe("reservation-modified", onUpdated);

    return () => {
      u1();
      u2();
      u3();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  const fmtTime = (iso: string | undefined) => {
    if (!iso) return "";
    const d = getDateInRestaurantTz(iso);
    if (!d) return "";
    return formatTimeHHmm(d);
  };

  const getPreOrderItemLines = (
    reservation: Reservation,
    maxLines: number | null
  ): Array<{ line: string; isResponsible: boolean }> => {
    const orderItems = (reservation as any)?.reservationOrder?.items;
    if (!Array.isArray(orderItems) || orderItems.length === 0) return [];

    const lines: Array<{ line: string; isResponsible: boolean }> = [];
    for (const it of orderItems) {
      const qty = typeof it?.quantity === "number" ? it.quantity : 1;
      const name = String(it?.meal?.name || "Item");
      const notes = String(it?.specialInstructions || "").trim();
      const isDrink = (it as any)?.meal?.isDrink;
      const isResponsible = isDepartmentResponsibleForItem(department, isDrink);
      const addons = Array.isArray(it?.addons)
        ? it.addons
            .map((a: any) => {
              const n = a?.addOnName || a?.addon?.name;
              const q = typeof a?.quantity === "number" ? a.quantity : 0;
              if (!n) return "";
              return q && q > 1 ? `${n} x${q}` : `${n}`;
            })
            .filter(Boolean)
            .join(", ")
        : "";
      let line = `${qty}x ${name}`;
      if (notes) line += ` — ${notes}`;
      if (addons) line += ` (+ ${addons})`;
      lines.push({ line, isResponsible });
      if (maxLines && lines.length >= maxLines) break;
    }
    return lines;
  };

  const showTooEarlyDialog = async (params: { title: string; description: string }): Promise<boolean> => {
    setTooEarlyDialogText(params);
    setTooEarlyDialogOpen(true);
    return await new Promise<boolean>((resolve) => {
      tooEarlyDialogResolveRef.current = resolve;
    });
  };

  const normalizeTicketItems = (ticketItems: any): Array<{ key: string; qty: number; raw: any }> => {
    const list = (ticketItems as any)?.items;
    if (!Array.isArray(list)) return [];
    const out: Array<{ key: string; qty: number; raw: any }> = [];
    for (const it of list) {
      const id = it?.id ? String(it.id) : "";
      const name = String(it?.name || "");
      const mods = {
        selectedSize: it?.selectedSize,
        notes: it?.notes,
        addons: Array.isArray(it?.addons)
          ? it.addons.map((a: any) => ({ name: a?.name, qty: a?.qty })).filter((a: any) => a?.name)
          : [],
        optionalIngredients: Array.isArray(it?.optionalIngredients)
          ? it.optionalIngredients.map((o: any) => ({ name: o?.name, isIncluded: o?.isIncluded })).filter((o: any) => o?.name)
          : [],
      };
      const key = id ? `${id}:${JSON.stringify(mods)}` : `${name}:${JSON.stringify(mods)}`;
      const qty = typeof it?.qty === "number" ? it.qty : Number(it?.qty || 0) || 0;
      out.push({ key, qty, raw: it });
    }
    return out;
  };

  const buildTicketDeltaItems = (currentItems: any[], lastTicketPayload: any | null): any[] => {
    const prevNormalized = normalizeTicketItems(lastTicketPayload);
    const prevMap = new Map<string, number>();
    for (const p of prevNormalized) {
      prevMap.set(p.key, (prevMap.get(p.key) || 0) + (p.qty || 0));
    }

    const next: any[] = [];
    const currNormalized = normalizeTicketItems({ items: currentItems });
    for (const c of currNormalized) {
      const prevQty = prevMap.get(c.key) || 0;
      const deltaQty = (c.qty || 0) - prevQty;
      if (deltaQty > 0) {
        next.push({ ...c.raw, qty: deltaQty });
      }
    }
    return next;
  };

  const createTicketForReservation = async (reservation: Reservation) => {
    try {
      const statusRaw = String((reservation as any)?.status || "").trim().toUpperCase();
      if (statusRaw !== "CONFIRMED" && statusRaw !== "SEATED") {
        toast.warning("This reservation must be CONFIRMED or SEATED to create a kitchen ticket.");
        return;
      }

      const nowTz = getNowInRestaurantTz();
      const reservationTz = getDateInRestaurantTz(reservation.reservationDate);
      if (reservationTz) {
        const diffMs = reservationTz.getTime() - nowTz.getTime();
        const oneHourMs = 60 * 60_000;
        if (diffMs > oneHourMs) {
          const nowText = formatTimeHHmm(nowTz);
          const resText = formatTimeHHmm(reservationTz);
          const ok = await showTooEarlyDialog({
            title: "Prepare reservation early?",
            description: `This reservation is for ${resText}. Current time is ${nowText}. Are you sure you want to prepare it now?`,
          });
          if (!ok) return;
        }
      }

      setCreatingForReservationId(reservation.id);
      const token = await getToken();
      if (!token) return;

      const orderItems = (reservation as any)?.reservationOrder?.items;
      const allowedItems = Array.isArray(orderItems)
        ? orderItems.filter((it: any) => (department === "BAR" ? Boolean(it?.meal?.isDrink) : !Boolean(it?.meal?.isDrink)))
        : [];

      const mappedItems = Array.isArray(allowedItems)
        ? allowedItems.map((it: any) => ({
            id: it?.id,
            name: it?.meal?.name,
            isDrink: (it as any)?.meal?.isDrink,
            qty: it?.quantity,
            selectedSize: it?.selectedSize,
            notes: it?.specialInstructions || undefined,
            addons: Array.isArray(it?.addons)
              ? it.addons.map((a: any) => ({ name: a?.addOnName || a?.addon?.name, qty: a?.quantity }))
              : [],
            optionalIngredients: Array.isArray(it?.optionalIngredients)
              ? it.optionalIngredients.map((o: any) => ({ name: o?.ingredientName, isIncluded: o?.isIncluded }))
              : [],
          }))
        : [];

      // Prevent unlimited duplicate tickets:
      // Only create a new ticket if there are NEW/INCREASED items since the latest ticket for this reservation today.
      let deltaItems = mappedItems;
      try {
        const today = getTodayKeyInRestaurantTz();
        const existingTickets = await kitchenTicketService.listKitchenTickets({ branchId, date: today }, token);
        const related = Array.isArray(existingTickets)
          ? existingTickets
              .filter((t: any) => String(t?.reservationId || "").trim() === String(reservation.id))
              .sort((a: any, b: any) => {
                const at = new Date(String(a?.createdAt || 0)).getTime();
                const bt = new Date(String(b?.createdAt || 0)).getTime();
                return bt - at;
              })
          : [];

        const last = related[0];
        const lastPayload = last?.items;
        deltaItems = buildTicketDeltaItems(mappedItems, lastPayload);

        if (!deltaItems || deltaItems.length === 0) {
          toast.info(department === "BAR" ? "No new drink items to send to the bar for this reservation." : "No new items to send to the kitchen for this reservation.");
          return;
        }
      } catch (deltaErr) {
        // If delta computation fails for any reason, fall back to current behavior.
        console.warn("Ticket delta computation failed; falling back to full items payload:", deltaErr);
      }

      if (!deltaItems || deltaItems.length === 0) {
        toast.info(department === "BAR" ? "No drink items to send to Bar." : "No food items to send to Kitchen.");
        return;
      }

      const payload = {
        source: department === "BAR" ? "bar_reservation" : "reservation",
        reservationNumber: reservation.reservationNumber,
        reservationId: reservation.id,
        customerName: reservation.customerName,
        guests: reservation.numberOfGuests,
        reservationDate: reservation.reservationDate,
        items: deltaItems,
      };

      await kitchenTicketService.createKitchenTicket(
        {
          branchId,
          reservationId: reservation.id,
          items: payload,
        },
        token
      );
    } catch (e) {
      console.error("Failed to create kitchen ticket for reservation:", e);
      toast.error("Failed to create kitchen ticket");
    } finally {
      setCreatingForReservationId(null);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <Dialog
        open={tooEarlyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTooEarlyDialogOpen(false);
            setTooEarlyDialogText(null);
            const resolve = tooEarlyDialogResolveRef.current;
            tooEarlyDialogResolveRef.current = null;
            resolve?.(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tooEarlyDialogText?.title || "Confirm"}</DialogTitle>
            <DialogDescription>{tooEarlyDialogText?.description || ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTooEarlyDialogOpen(false);
                setTooEarlyDialogText(null);
                const resolve = tooEarlyDialogResolveRef.current;
                tooEarlyDialogResolveRef.current = null;
                resolve?.(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setTooEarlyDialogOpen(false);
                setTooEarlyDialogText(null);
                const resolve = tooEarlyDialogResolveRef.current;
                tooEarlyDialogResolveRef.current = null;
                resolve?.(true);
              }}
            >
              Prepare now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 40 }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>Today’s reservations</div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : activeReservations.length === 0 ? (
        <div style={{ padding: 14, borderRadius: 12, border: "1px dashed #e5e7eb", background: "#fff", color: "#6b7280" }}>
          No reservations found for today.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(() => {
            const renderReservationCard = (r: any) => (
              <div
                key={r.id}
                id={`kitchen-reservation-${r.id}`}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: "#ffffff",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 900, color: "#111827" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: getReservationAccentColor(r.id),
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    {r.customerName || "Reservation"}
                    <span style={{ marginLeft: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{r.reservationNumber}</span>
                  </div>
                  {(() => {
                    const d = getDateInRestaurantTz(r.reservationDate);
                    const canPrep = isWithinOneHourTo(d);
                    return (
                      <div style={{ fontSize: 12, color: canPrep ? "#16a34a" : "#6b7280", fontWeight: canPrep ? 900 : 400 }}>
                        {fmtTime(r.reservationDate)}
                    {typeof r.numberOfGuests === "number" ? ` • ${r.numberOfGuests} guests` : ""}
                      </div>
                    );
                  })()}

                  {r.type === "PRE_ORDER" ? (
                    <div style={{ marginTop: 8 }}>
                      {(() => {
                        const expanded = !!expandedReservationIds[r.id];
                        const orderItems = (r as any)?.reservationOrder?.items;
                        const itemCount = Array.isArray(orderItems) ? orderItems.length : 0;

                        return (
                          <>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                                minWidth: 0,
                              }}
                            >
                              <div style={{ fontSize: 12, color: "#111827", fontWeight: 900 }}>
                                Pre-order items
                                <span style={{ marginLeft: 8, color: "#6b7280", fontWeight: 800 }}>{itemCount}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedReservationIds((prev) => ({
                                    ...prev,
                                    [r.id]: !prev[r.id],
                                  }))
                                }
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#111827",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  fontWeight: 900,
                                  padding: 0,
                                  flexShrink: 0,
                                }}
                              >
                                {expanded ? "Hide items" : "Show items"}
                              </button>
                            </div>

                            {expanded ? (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: 10,
                                  borderRadius: 12,
                                  border: "1px solid #e5e7eb",
                                  background: "#f9fafb",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                  minWidth: 0,
                                }}
                              >
                                {getPreOrderItemLines(r, null).map((row, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      fontSize: 12,
                                      color: row.isResponsible ? "#16a34a" : "#111827",
                                      fontWeight: 700,
                                      whiteSpace: "normal",
                                      overflowWrap: "anywhere",
                                      wordBreak: "break-word",
                                    }}
                                    title={row.line}
                                  >
                                    {row.line}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>{r.status}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{r.type}</div>
                  <button
                    type="button"
                    disabled={creatingForReservationId === r.id}
                    onClick={() => void createTicketForReservation(r)}
                    style={{
                      marginTop: 2,
                      padding: "7px 10px",
                      borderRadius: 10,
                      border: "1px solid #111827",
                      background: "#fff",
                      color: "#111827",
                      cursor: creatingForReservationId === r.id ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      fontSize: 12,
                      opacity: creatingForReservationId === r.id ? 0.7 : 1,
                    }}
                  >
                    {creatingForReservationId === r.id ? "Creating…" : "Create ticket"}
                  </button>
                </div>
              </div>
            );

            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                    Upcoming
                    <span style={{ marginLeft: 8, color: "#6b7280", fontWeight: 900 }}>
                      ({prioritized.upcomingConfirmed.length})
                    </span>
                  </div>
                </div>
                {prioritized.upcomingConfirmed.length === 0 ? (
                  <div style={{ padding: 10, borderRadius: 12, border: "1px dashed #e5e7eb", background: "#fff", color: "#6b7280" }}>
                    No upcoming reservations.
                  </div>
                ) : (
                  prioritized.upcomingConfirmed.map(renderReservationCard)
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                    Seated
                    <span style={{ marginLeft: 8, color: "#6b7280", fontWeight: 900 }}>
                      ({prioritized.seated.length})
                    </span>
                  </div>
                </div>
                {prioritized.seated.length === 0 ? (
                  <div style={{ padding: 10, borderRadius: 12, border: "1px dashed #e5e7eb", background: "#fff", color: "#6b7280" }}>
                    No seated reservations.
                  </div>
                ) : (
                  prioritized.seated.map(renderReservationCard)
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const KitchenReservationTab: React.FC<{ branchId: string; onReservationsCountChange?: (count: number) => void }> = ({
  branchId,
  onReservationsCountChange,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        gap: 14,
        alignItems: "start",
        width: "100%",
      }}
    >
      <KitchenReservationsList branchId={branchId} onCountChange={onReservationsCountChange} />
      <KitchenTicketsBoard branchId={branchId} />
    </div>
  );
};

const PickupOrdersList: React.FC<{
  branchId: string;
  onCountChange?: (count: number) => void;
  highlightedOrderId?: string | null;
  onToggleHighlightOrderId?: (orderId: string) => void;
  mergeNotices?: Record<string, MergeNotice>;
  mergePulse?: Record<string, number>;
  onAcknowledgeMerge?: (orderId: string) => void;
}> = ({ branchId, onCountChange, highlightedOrderId, onToggleHighlightOrderId, mergeNotices, mergePulse, onAcknowledgeMerge }) => {
  const department = useDepartment();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [creatingTicketForOrderId, setCreatingTicketForOrderId] = useState<string | null>(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [tooEarlyDialogOpen, setTooEarlyDialogOpen] = useState(false);
  const [tooEarlyDialogText, setTooEarlyDialogText] = useState<{ title: string; description: string } | null>(null);
  const tooEarlyDialogResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const latestFetchRef = useRef(0);

  const todayKey = useMemo(() => getTodayKeyInRestaurantTz(), []);

  const normalizeTicketPayload = (raw: any): any => {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  };

  const showTooEarlyDialog = async (params: { title: string; description: string }): Promise<boolean> => {
    setTooEarlyDialogText(params);
    setTooEarlyDialogOpen(true);
    return await new Promise<boolean>((resolve) => {
      tooEarlyDialogResolveRef.current = resolve;
    });
  };

  const isOrderTodayForPickupQueue = (o: any): boolean => {
    const isScheduled = Boolean(o?.isScheduledOrder && o?.scheduledDate);
    if (isScheduled) {
      const d = getDateInRestaurantTz(String(o?.scheduledDate || ""));
      if (!d) return false;
      const key = getDateKeyInRestaurantTz(d);
      return key === todayKey;
    }
    // ASAP: backend request is already filtered by createdAt date == todayKey
    return true;
  };

  const loadOrders = async () => {
    const now = Date.now();
    latestFetchRef.current = now;
    try {
      setLoading(true);
      const token = (await getToken()) || undefined;
      const asapPromise = orderService.getOrders(
        1,
        200,
        "",
        "createdAt",
        "desc",
        "",
        "",
        "",
        todayKey,
        todayKey,
        branchId,
        "",
        "PICKUP",
        "asap",
        "all",
        "",
        token
      );

      // Scheduled orders should not depend on createdAt date; we will filter client-side to only today.
      const scheduledPromise = orderService.getOrders(
        1,
        200,
        "",
        "scheduledDate",
        "asc",
        "",
        "",
        "",
        undefined,
        undefined,
        branchId,
        "",
        "PICKUP",
        "scheduled",
        "all",
        "",
        token
      );

      const [asapResp, scheduledResp] = await Promise.all([asapPromise, scheduledPromise]);
      if (latestFetchRef.current !== now) return;

      const normalizedAsap = Array.isArray(asapResp?.orders) ? asapResp.orders : [];
      const normalizedScheduled = Array.isArray(scheduledResp?.orders) ? scheduledResp.orders : [];
      const combined = [...normalizedAsap, ...normalizedScheduled];
      const byId = new Map<string, any>();
      for (const o of combined) {
        if (!o?.id) continue;
        if (!byId.has(o.id)) byId.set(o.id, o);
      }
      const merged = Array.from(byId.values());

      const active = merged
        .filter((o: any) => !isOrderDone(o))
        .filter((o: any) => isOrderTodayForPickupQueue(o))
        .filter((o: any) => (department === "BAR" ? orderHasDrinkItems(o) : true));

      active.sort((a: any, b: any) => {
        const aIsScheduled = Boolean(a?.isScheduledOrder && a?.scheduledDate);
        const bIsScheduled = Boolean(b?.isScheduledOrder && b?.scheduledDate);
        if (aIsScheduled && bIsScheduled) {
          const at = new Date(String(a?.scheduledDate || 0)).getTime();
          const bt = new Date(String(b?.scheduledDate || 0)).getTime();
          return at - bt;
        }
        if (aIsScheduled !== bIsScheduled) return aIsScheduled ? 1 : -1; // ASAP first
        const at = new Date(String(a?.createdAt || 0)).getTime();
        const bt = new Date(String(b?.createdAt || 0)).getTime();
        return bt - at;
      });

      setOrders(active);
      onCountChange?.(active.length);
    } catch {
      if (latestFetchRef.current !== now) return;
      setOrders([]);
      onCountChange?.(0);
    } finally {
      if (latestFetchRef.current !== now) return;
      setLoading(false);
    }
  };

  const loadTickets = async () => {
    try {
      setTicketLoading(true);
      const token = await getToken();
      if (!token) {
        setTickets([]);
        return;
      }
      const list = await kitchenTicketService.listKitchenTickets({ branchId, date: todayKey }, token);
      const expectedSource = department === "BAR" ? "bar_pickup" : "pickup";
      const filtered = Array.isArray(list)
        ? list.filter((t: any) => {
            const payload = normalizeTicketPayload((t as any)?.items);
            return String(payload?.source || "").trim().toLowerCase() === expectedSource;
          })
        : [];
      setTickets(filtered);
    } catch {
      setTickets([]);
    } finally {
      setTicketLoading(false);
    }
  };

  useEffect(() => {
    if (!branchId) return;
    void loadOrders();
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const matchesBranch = (payload: any): boolean => {
      const order = payload?.order || payload;
      const bId = order?.branch?.id || order?.branchId;
      return bId && String(bId) === String(branchId);
    };
    const unsubNew = subscribe("new-order", (payload: any) => {
      if (!matchesBranch(payload)) return;
      const o = payload?.order;
      if (String(o?.orderType || "").trim().toUpperCase() !== "PICKUP") return;
      void loadOrders();
    });
    const unsubUpd = subscribe("order-updated", (payload: any) => {
      if (!matchesBranch(payload)) return;
      const o = payload?.order;
      if (String(o?.orderType || "").trim().toUpperCase() !== "PICKUP") return;
      void loadOrders();
    });
    const unsubTicketCreated = subscribe("kitchen-ticket-created", (payload: any) => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      if (!bId || String(bId) !== String(branchId)) return;
      void loadTickets();
    });
    const unsubTicketUpdated = subscribe("kitchen-ticket-updated", (payload: any) => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      if (!bId || String(bId) !== String(branchId)) return;
      void loadTickets();
    });
    return () => {
      unsubNew();
      unsubUpd();
      unsubTicketCreated();
      unsubTicketUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  const ticketsByOrderId = useMemo(() => {
    const map = new Map<string, KitchenTicket>();
    for (const t of tickets) {
      const payload = normalizeTicketPayload((t as any)?.items);
      const orderId = String(payload?.orderId || "").trim();
      if (!orderId) continue;
      if (!map.has(orderId)) {
        map.set(orderId, t);
        continue;
      }
      const prev = map.get(orderId) as any;
      const pt = new Date(String(prev?.createdAt || 0)).getTime();
      const nt = new Date(String((t as any)?.createdAt || 0)).getTime();
      if (nt > pt) map.set(orderId, t);
    }
    return map;
  }, [tickets]);

  const sendToKitchen = async (order: Order) => {
    try {
      const statusRaw = String((order as any)?.status || "").trim().toUpperCase();
      if (statusRaw !== "CONFIRMED") {
        toast.warning("Order must be CONFIRMED to send to kitchen.");
        return;
      }

      const isScheduled = Boolean((order as any)?.isScheduledOrder && (order as any)?.scheduledDate);
      if (isScheduled) {
        const nowTz = getNowInRestaurantTz();
        const scheduledTz = getDateInRestaurantTz(String((order as any)?.scheduledDate || ""));
        if (scheduledTz) {
          const diffMs = scheduledTz.getTime() - nowTz.getTime();
          const oneHourMs = 60 * 60_000;
          if (diffMs > oneHourMs) {
            const nowText = formatTimeHHmm(nowTz);
            const schText = formatTimeHHmm(scheduledTz);
            const ok = await showTooEarlyDialog({
              title: "Prepare pickup early?",
              description: `This pickup is scheduled for ${schText}. Current time is ${nowText}. Are you sure you want to prepare it now?`,
            });
            if (!ok) return;
          }
        }
      }

      if (ticketsByOrderId.has(order.id)) {
        toast.info("Kitchen ticket already exists for this order.");
        return;
      }
      setCreatingTicketForOrderId(order.id);
      const token = await getToken();
      if (!token) return;

      const allowedItems = Array.isArray(order.orderItems)
        ? order.orderItems.filter((it: any) => (department === "BAR" ? Boolean(it?.meal?.isDrink) : !Boolean(it?.meal?.isDrink)))
        : [];

      const mappedItems = Array.isArray(allowedItems)
        ? allowedItems.map((it: any) => ({
            id: it?.id,
            name: it?.meal?.name,
            isDrink: (it as any)?.meal?.isDrink,
            qty: it?.quantity,
            selectedSize: it?.selectedSize,
            notes: it?.specialInstructions || undefined,
            addons: Array.isArray(it?.orderItemAddOns)
              ? it.orderItemAddOns.map((a: any) => ({
                  name: a?.addOnName,
                  qty: a?.quantity,
                }))
              : [],
            optionalIngredients: Array.isArray(it?.orderItemOptionalIngredients)
              ? it.orderItemOptionalIngredients.map((o: any) => ({
                  name: o?.ingredientName,
                  isIncluded: o?.isIncluded,
                }))
              : [],
          }))
        : [];

      if (!mappedItems || mappedItems.length === 0) {
        toast.info(department === "BAR" ? "No drink items to send to Bar." : "No food items to send to Kitchen.");
        return;
      }

      const payload = {
        source: department === "BAR" ? "bar_pickup" : "pickup",
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId,
        items: mappedItems,
      };

      await kitchenTicketService.createKitchenTicket({ branchId, reservationId: null, items: payload }, token);
    } catch (e) {
      console.error("Failed to create kitchen ticket for pickup order:", e);
      toast.error("Failed to create kitchen ticket");
    } finally {
      setCreatingTicketForOrderId(null);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <Dialog
        open={tooEarlyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTooEarlyDialogOpen(false);
            setTooEarlyDialogText(null);
            const resolve = tooEarlyDialogResolveRef.current;
            tooEarlyDialogResolveRef.current = null;
            resolve?.(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tooEarlyDialogText?.title || "Confirm"}</DialogTitle>
            <DialogDescription>{tooEarlyDialogText?.description || ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTooEarlyDialogOpen(false);
                setTooEarlyDialogText(null);
                const resolve = tooEarlyDialogResolveRef.current;
                tooEarlyDialogResolveRef.current = null;
                resolve?.(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setTooEarlyDialogOpen(false);
                setTooEarlyDialogText(null);
                const resolve = tooEarlyDialogResolveRef.current;
                tooEarlyDialogResolveRef.current = null;
                resolve?.(true);
              }}
            >
              Prepare now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 40 }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>Pickup orders</div>
        <button
          type="button"
          onClick={() => {
            void loadOrders();
            void loadTickets();
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ padding: 14, borderRadius: 12, border: "1px dashed #e5e7eb", background: "#fff", color: "#6b7280" }}>
          No pickup orders for today.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {orders.map((o) => {
            const t = ticketsByOrderId.get(o.id);
            const expanded = !!expandedOrderIds[o.id];
            const itemCount = Array.isArray((o as any)?.orderItems) ? (o as any).orderItems.length : 0;
            const statusRaw = String((o as any)?.status || "").trim().toUpperCase();
            const canCreateTicket = statusRaw === "CONFIRMED";
            const isScheduled = Boolean((o as any)?.isScheduledOrder && (o as any)?.scheduledDate);
            const scheduledTz = isScheduled ? getDateInRestaurantTz(String((o as any)?.scheduledDate || "")) : null;
            const canPrep = isScheduled ? isWithinOneHourTo(scheduledTz) : false;
            const isHighlighted = Boolean(highlightedOrderId && String(highlightedOrderId) === String(o.id));
            const mergeNotice = mergeNotices?.[String(o.id)];
            const isMergePulsing = Boolean(mergePulse?.[String(o.id)]);
            return (
              <div
                key={o.id}
                id={`kitchen-order-${o.id}`}
                onClick={() => onToggleHighlightOrderId?.(String(o.id))}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: isMergePulsing ? "#fffbeb" : "#ffffff",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  minWidth: 0,
                  boxShadow: isHighlighted ? "0 0 0 2px rgba(17,24,39,0.25)" : undefined,
                  borderColor: isHighlighted ? "#111827" : isMergePulsing ? "#f59e0b" : "#e5e7eb",
                  cursor: onToggleHighlightOrderId ? "pointer" : undefined,
                  transition: "background 250ms ease, border-color 250ms ease",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: "#111827" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: getPickupAccentColor(o.id),
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    #{o.orderNumber}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{o.pickupPhone ? `Phone: ${o.pickupPhone}` : ""}</div>
                  {o.pickupNotes ? <div style={{ fontSize: 12, color: "#6b7280" }}>Notes: {o.pickupNotes}</div> : null}
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                    {ticketLoading ? "Loading ticket…" : t ? `Ticket: ${t.status}` : "No ticket"}
                  </div>

                  {mergeNotice ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid #f59e0b",
                        background: "#fffbeb",
                        color: "#92400e",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 950 }}>Merged update received</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309" }}>
                        Added items: {Array.isArray(mergeNotice.newItems) ? mergeNotice.newItems.length : 0}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcknowledgeMerge?.(String(o.id));
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #92400e",
                            background: "#fff",
                            color: "#92400e",
                            cursor: "pointer",
                            fontWeight: 950,
                            fontSize: 12,
                          }}
                        >
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#111827", fontWeight: 900 }}>
                        Items
                        <span style={{ marginLeft: 8, color: "#6b7280", fontWeight: 800 }}>{itemCount}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedOrderIds((prev) => ({
                            ...prev,
                            [o.id]: !prev[o.id],
                          }));
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#111827",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 900,
                          padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        {expanded ? "Hide items" : "Show items"}
                      </button>
                    </div>

                    {expanded ? (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: "#f9fafb",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        {(Array.isArray((o as any)?.orderItems) ? (o as any).orderItems : []).map((it: any, idx: number) => {
                          const name = it?.meal?.name || "Item";
                          const qty = typeof it?.quantity === "number" ? it.quantity : 1;
                          const size = String(it?.selectedSize || "").trim();
                          const notes = String(it?.specialInstructions || "").trim();
                          const isDrink = (it as any)?.meal?.isDrink;
                          const isResponsible = isDepartmentResponsibleForItem(department, isDrink);
                          let line = `${qty}x ${name}`;
                          if (size) line += ` (${size})`;
                          if (notes) line += ` — ${notes}`;
                          return (
                            <div
                              key={it?.id || idx}
                              style={{
                                fontSize: 12,
                                color: isResponsible ? "#16a34a" : "#111827",
                                fontWeight: 700,
                                whiteSpace: "normal",
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                              }}
                              title={line}
                            >
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>{o.status}</div>
                  <div style={{ fontSize: 12, color: canPrep ? "#16a34a" : "#6b7280", fontWeight: 900 }}>
                    {isScheduled ? `Scheduled${scheduledTz ? ` • ${formatTimeHHmm(scheduledTz)}` : ""}` : "ASAP"}
                  </div>
                  {!t ? (
                    <button
                      type="button"
                      disabled={!canCreateTicket || creatingTicketForOrderId === o.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void sendToKitchen(o);
                      }}
                      style={{
                        marginTop: 2,
                        padding: "7px 10px",
                        borderRadius: 10,
                        border: "1px solid #111827",
                        background: "#fff",
                        color: "#111827",
                        cursor: !canCreateTicket || creatingTicketForOrderId === o.id ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                        opacity: !canCreateTicket || creatingTicketForOrderId === o.id ? 0.7 : 1,
                      }}
                    >
                      {creatingTicketForOrderId === o.id ? (
                        "Creating…"
                      ) : (
                        <span style={{ display: "inline-block", textAlign: "center", lineHeight: "14px" }}>
                          Create
                          <br />
                          ticket
                        </span>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PickupTicketsBoard: React.FC<{
  branchId: string;
  highlightedOrderId?: string | null;
  onToggleHighlightOrderId?: (orderId: string) => void;
  mergeNotices?: Record<string, MergeNotice>;
  mergePulse?: Record<string, number>;
  onAcknowledgeMerge?: (orderId: string) => void;
}> = ({ branchId, highlightedOrderId, onToggleHighlightOrderId, mergeNotices, mergePulse, onAcknowledgeMerge }) => {
  const department = useDepartment();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const latestFetchRef = useRef(0);
  const [orderStatusById, setOrderStatusById] = useState<Record<string, string>>({});
  const todayKey = useMemo(() => getTodayKeyInRestaurantTz(), []);

  const normalizeTicketPayload = (raw: any): any => {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  };

  const load = async () => {
    const now = Date.now();
    latestFetchRef.current = now;
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setTickets([]);
        setOrderStatusById({});
        return;
      }
      const [list, ordersResp] = await Promise.all([
        kitchenTicketService.listKitchenTickets({ branchId, date: todayKey }, token),
        orderService.getOrders(
          1,
          250,
          "",
          "createdAt",
          "desc",
          "",
          "",
          "",
          todayKey,
          todayKey,
          branchId,
          "",
          "PICKUP",
          "all",
          "all",
          "",
          token
        ),
      ]);
      if (latestFetchRef.current !== now) return;
      const expectedSource = department === "BAR" ? "bar_pickup" : "pickup";
      const filtered = Array.isArray(list)
        ? list.filter(
            (t: any) =>
              String(normalizeTicketPayload((t as any)?.items)?.source || "")
                .trim()
                .toLowerCase() === expectedSource
          )
        : [];
      setTickets(filtered);

      const orders = Array.isArray((ordersResp as any)?.orders) ? (ordersResp as any).orders : [];
      const statusMap: Record<string, string> = {};
      for (const o of orders) {
        const id = String((o as any)?.id || "").trim();
        if (!id) continue;
        statusMap[id] = String((o as any)?.status || "").trim().toUpperCase();
      }
      setOrderStatusById(statusMap);
    } catch {
      if (latestFetchRef.current !== now) return;
      setTickets([]);
      setOrderStatusById({});
    } finally {
      if (latestFetchRef.current !== now) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branchId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const matchesBranch = (payload: any): boolean => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      return bId && String(bId) === String(branchId);
    };
    const unsubCreated = subscribe("kitchen-ticket-created", (payload: any) => {
      if (!matchesBranch(payload)) return;
      void load();
    });
    const unsubUpdated = subscribe("kitchen-ticket-updated", (payload: any) => {
      if (!matchesBranch(payload)) return;
      void load();
    });
    return () => {
      unsubCreated();
      unsubUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  useEffect(() => {
    if (!branchId) return;

    const matchesBranch = (payload: any): boolean => {
      const order = payload?.order || payload;
      const bId = order?.branch?.id || order?.branchId;
      return bId && String(bId) === String(branchId);
    };

    const updateStatusFromOrder = (payload: any) => {
      const order = payload?.order || payload;
      if (!order) return;
      if (!matchesBranch(payload)) return;
      if (String(order?.orderType || "").trim().toUpperCase() !== "PICKUP") return;
      const id = String(order?.id || "").trim();
      if (!id) return;
      const status = String(order?.status || "").trim().toUpperCase();
      setOrderStatusById((prev) => ({ ...prev, [id]: status }));
    };

    const unsubUpdated = subscribe("order-updated", updateStatusFromOrder);
    const unsubStatusChanged = subscribe("order-status-changed", updateStatusFromOrder);
    return () => {
      unsubUpdated();
      unsubStatusChanged();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  type PickupBoardColumnKey = KitchenTicketStatus | "DONE";

  const pickupStatusColumns: Array<{ key: PickupBoardColumnKey; title: string }> = useMemo(
    () => [
      { key: "NEW", title: "New" },
      { key: "PREPARING", title: "Preparing" },
      { key: "READY", title: "Ready" },
      { key: "CANCELLED", title: "Aborted" },
      { key: "DONE", title: "Done" },
    ],
    []
  );

  const byStatus = useMemo(() => {
    const map: Record<PickupBoardColumnKey, KitchenTicket[]> = {
      NEW: [],
      PREPARING: [],
      READY: [],
      CANCELLED: [],
      DONE: [],
    };

    for (const t of tickets) {
      const payload = normalizeTicketPayload(t.items);
      const orderId = String(payload?.orderId || "").trim();
      const orderStatus = orderId ? String(orderStatusById[orderId] || "").trim().toUpperCase() : "";
      const isDoneOrder = orderStatus === "PICKED_UP" || orderStatus === "DELIVERED";
      if (isDoneOrder) {
        map.DONE.push(t);
        continue;
      }

      const s = (t.status || "NEW") as KitchenTicketStatus;
      (map[s] || map.NEW).push(t);
    }
    return map;
  }, [tickets, orderStatusById]);

  const moveStatus = async (ticketId: string, next: KitchenTicketStatus) => {
    try {
      const token = await getToken();
      if (!token) return;
      await kitchenTicketService.updateKitchenTicketStatus({ id: ticketId, status: next }, token);
    } catch (err) {
      console.error("Failed to update pickup kitchen ticket status:", err);
      toast.error("Failed to update ticket status");
    }
  };

  const getTicketTitle = (ticket: KitchenTicket): string => {
    const payload = normalizeTicketPayload(ticket.items);
    const on = payload?.orderNumber ? `#${payload.orderNumber}` : "Order";
    return on;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 40 }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>Pickup tickets</div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px dashed #e5e7eb", background: "#ffffff", color: "#6b7280" }}>
          No pickup tickets for today.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(280px, 1fr))",
            gap: 12,
            width: "100%",
            overflowX: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          {pickupStatusColumns.map((col) => (
            <div
              key={col.key}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 0,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>{col.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>{byStatus[col.key].length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1, minHeight: 0, paddingRight: 2 }}>
                {byStatus[col.key].map((t) => {
                  const canToPreparing = t.status === "NEW";
                  const canToReady = t.status === "PREPARING";
                  const canAbort = t.status !== "READY" && t.status !== "CANCELLED";
                  const payload = normalizeTicketPayload(t.items);
                  const orderId = String(payload?.orderId || "").trim();
                  const doneOrderStatus = String(orderStatusById[orderId] || "").trim().toUpperCase();
                  const isDone = col.key === "DONE" || doneOrderStatus === "PICKED_UP";
                  const isHighlighted = Boolean(highlightedOrderId && orderId && String(highlightedOrderId) === orderId);
                  const mergeNotice = orderId ? mergeNotices?.[orderId] : undefined;
                  const isMergePulsing = Boolean(orderId && mergePulse?.[orderId]);
                  return (
                    <div
                      key={t.id}
                      id={`kitchen-ticket-${t.id}`}
                      onClick={() => {
                        if (!orderId) return;
                        onToggleHighlightOrderId?.(orderId);
                      }}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 12,
                        background: isHighlighted ? "#ffffff" : isMergePulsing ? "#fffbeb" : "#f9fafb",
                        minWidth: 0,
                        boxShadow: isHighlighted ? "0 0 0 2px rgba(17,24,39,0.25)" : undefined,
                        borderColor: isHighlighted ? "#111827" : isMergePulsing ? "#f59e0b" : "#e5e7eb",
                        cursor: onToggleHighlightOrderId && orderId ? "pointer" : undefined,
                        transition: "background 250ms ease, border-color 250ms ease",
                      }}
                    >
                      {mergeNotice ? (
                        <div
                          style={{
                            marginBottom: 10,
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid #f59e0b",
                            background: "#fffbeb",
                            color: "#92400e",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 950 }}>Merged update received</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309" }}>
                            Added items: {Array.isArray(mergeNotice.newItems) ? mergeNotice.newItems.length : 0}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!orderId) return;
                                onAcknowledgeMerge?.(orderId);
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 10,
                                border: "1px solid #92400e",
                                background: "#fff",
                                color: "#92400e",
                                cursor: "pointer",
                                fontWeight: 950,
                                fontSize: 12,
                              }}
                            >
                              Acknowledge
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 900, color: "#111827", minWidth: 0 }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: getPickupAccentColor(orderId),
                              marginRight: 8,
                              verticalAlign: "middle",
                            }}
                          />
                          {getTicketTitle(t)}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{t.status}</div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>{orderId ? `Order: ${orderId}` : "Order"}</div>
                      {isDone ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#16a34a", fontWeight: 900 }}>Done</div>
                      ) : null}

                      <div style={{ marginTop: 10 }}>
                        {Array.isArray(payload?.items) ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {payload.items.map((it: any, idx: number) => (
                              <div key={it?.id || idx} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontSize: 13, color: "#111827", fontWeight: 900 }}>{String(it?.name || "Item")}</div>
                                  <div style={{ fontSize: 13, color: "#111827", fontWeight: 900 }}>x{typeof it?.qty === "number" ? it.qty : 1}</div>
                                </div>
                                {it?.notes ? <div style={{ fontSize: 12, color: "#6b7280" }}>{String(it.notes)}</div> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>No items.</div>
                        )}
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {!isDone && canToPreparing ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveStatus(t.id, "PREPARING");
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #111827",
                              background: "#111827",
                              color: "#fff",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            Start preparing
                          </button>
                        ) : null}
                        {!isDone && canToReady ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveStatus(t.id, "READY");
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #111827",
                              background: "#fff",
                              color: "#111827",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            Mark ready
                          </button>
                        ) : null}
                        {!isDone && canAbort ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveStatus(t.id, "CANCELLED");
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #b91c1c",
                              background: "#fff",
                              color: "#b91c1c",
                              cursor: "pointer",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            Abort
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const KitchenPickupTab: React.FC<{
  branchId: string;
  onPickupCountChange?: (count: number) => void;
  mergeNotices?: Record<string, MergeNotice>;
  mergePulse?: Record<string, number>;
  onAcknowledgeMerge?: (orderId: string) => void;
}> = ({
  branchId,
  onPickupCountChange,
  mergeNotices,
  mergePulse,
  onAcknowledgeMerge,
}) => {
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        gap: 14,
        alignItems: "start",
        width: "100%",
      }}
    >
      <PickupOrdersList
        branchId={branchId}
        onCountChange={onPickupCountChange}
        highlightedOrderId={highlightedOrderId}
        onToggleHighlightOrderId={(orderId) => setHighlightedOrderId((prev) => (prev === orderId ? null : orderId))}
        mergeNotices={mergeNotices}
        mergePulse={mergePulse}
        onAcknowledgeMerge={onAcknowledgeMerge}
      />
      <PickupTicketsBoard
        branchId={branchId}
        highlightedOrderId={highlightedOrderId}
        onToggleHighlightOrderId={(orderId) => setHighlightedOrderId((prev) => (prev === orderId ? null : orderId))}
        mergeNotices={mergeNotices}
        mergePulse={mergePulse}
        onAcknowledgeMerge={onAcknowledgeMerge}
      />
    </div>
  );
};

const KitchenTicketsBoard: React.FC<{ branchId: string }> = ({ branchId }) => {
  const department = useDepartment();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const latestFetchRef = useRef(0);
  const [reservationStatusById, setReservationStatusById] = useState<Record<string, string>>({});

  const todayKey = useMemo(() => {
    return getTodayKeyInRestaurantTz();
  }, []);

  const normalizeTicketPayload = (raw: any): any => {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return { items: [raw] };
      }
    }
    return raw;
  };

  const load = async () => {
    const now = Date.now();
    latestFetchRef.current = now;

    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setTickets([]);
        setReservationStatusById({});
        return;
      }
      const [list, reservationsResp] = await Promise.all([
        kitchenTicketService.listKitchenTickets({ branchId, date: todayKey }, token),
        reservationService.getReservations(1, 250, { branchId, date: todayKey }, token),
      ]);
      if (latestFetchRef.current !== now) return;
      const normalized = Array.isArray(list) ? list : [];
      const filtered = normalized.filter((t: any) => {
        const payload = normalizeTicketPayload((t as any)?.items);
        const source = String(payload?.source || "").trim().toLowerCase();
        if (department === "BAR") {
          // Bar reservation tab shows only bar reservation / bar walk-in
          if (!source.startsWith("bar_")) return false;
          if (source === "bar_pickup" || source === "bar_delivery") return false;
          return true;
        }
        // Kitchen reservation tab should not show pickup/delivery tickets.
        if (source === "pickup" || source === "delivery") return false;
        return !source.startsWith("bar_");
      });
      setTickets(filtered);

      const resList = (reservationsResp as any)?.data?.reservations;
      const reservations = Array.isArray(resList) ? resList : [];
      const nextStatus: Record<string, string> = {};
      for (const r of reservations) {
        const id = String((r as any)?.id || "").trim();
        if (!id) continue;
        nextStatus[id] = String((r as any)?.status || "").trim().toUpperCase();
      }
      setReservationStatusById(nextStatus);
    } catch {
      if (latestFetchRef.current !== now) return;
      setTickets([]);
      setReservationStatusById({});
    } finally {
      if (latestFetchRef.current !== now) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branchId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;

    const matchesBranch = (payload: any): boolean => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      return bId && String(bId) === String(branchId);
    };

    const unsubCreated = subscribe("kitchen-ticket-created", (payload: any) => {
      if (!matchesBranch(payload)) return;
      void load();
    });

    const unsubUpdated = subscribe("kitchen-ticket-updated", (payload: any) => {
      if (!matchesBranch(payload)) return;
      void load();
    });

    return () => {
      unsubCreated();
      unsubUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  useEffect(() => {
    if (!branchId) return;

    const getReservationFromPayload = (payload: any): any => payload?.reservation || payload;

    const matchesReservationBranch = (payload: any): boolean => {
      const reservation = getReservationFromPayload(payload);
      const bId = reservation?.branchId || reservation?.branch?.id;
      return bId && String(bId) === String(branchId);
    };

    const applyReservationStatus = (reservationIdRaw: any, statusRaw: any) => {
      const reservationId = String(reservationIdRaw || "").trim();
      if (!reservationId) return;
      const status = String(statusRaw || "").trim().toUpperCase();
      if (!status) return;

      setReservationStatusById((prev: Record<string, string>) => {
        const current = String(prev[reservationId] || "").trim().toUpperCase();
        if (current === status) return prev;
        return { ...prev, [reservationId]: status };
      });
    };

    const onReservationUpdated = (payload: any) => {
      if (!matchesReservationBranch(payload)) return;
      const reservation = getReservationFromPayload(payload);
      applyReservationStatus(reservation?.id, reservation?.status);
      void load();
    };

    const onReservationStatusChanged = (payload: any) => {
      if (!matchesReservationBranch(payload)) return;
      applyReservationStatus(payload?.reservationId, payload?.status);
      void load();
    };

    const u1 = subscribe("reservation-updated", onReservationUpdated);
    const u2 = subscribe("reservation-modified", onReservationUpdated);
    const u3 = subscribe("reservation-status-changed", onReservationStatusChanged);

    return () => {
      u1();
      u2();
      u3();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, subscribe]);

  type ReservationBoardColumnKey = KitchenTicketStatus | "DONE";

  const reservationStatusColumns: Array<{ key: ReservationBoardColumnKey; title: string }> = useMemo(
    () => [
      { key: "NEW", title: "New" },
      { key: "PREPARING", title: "Preparing" },
      { key: "READY", title: "Ready" },
      { key: "CANCELLED", title: "Aborted" },
      { key: "DONE", title: "Done" },
    ],
    []
  );

  const byStatus = useMemo(() => {
    const map: Record<ReservationBoardColumnKey, KitchenTicket[]> = {
      NEW: [],
      PREPARING: [],
      READY: [],
      CANCELLED: [],
      DONE: [],
    };

    for (const t of tickets) {
      const payload = normalizeTicketPayload(t.items);
      const reservationId = String(t.reservationId || payload?.reservationId || "").trim();
      const resStatus = reservationId ? String(reservationStatusById[reservationId] || "").trim().toUpperCase() : "";
      if (resStatus === "COMPLETED") {
        map.DONE.push(t);
        continue;
      }

      const s = (t.status || "NEW") as KitchenTicketStatus;
      (map[s] || map.NEW).push(t);
    }
    return map;
  }, [tickets, reservationStatusById]);

  const getErrorMessage = (err: any): string => {
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Request failed";
    const status = err?.status || err?.response?.status;
    return status ? `${msg} (HTTP ${status})` : String(msg);
  };

  const getTicketTitle = (ticket: KitchenTicket): string => {
    const payload = normalizeTicketPayload(ticket.items);
    if (payload?.source === "reservation") {
      const rn = payload?.reservationNumber ? String(payload.reservationNumber) : "";
      const cn = payload?.customerName ? String(payload.customerName) : "";
      return ["Reservation", rn, cn].filter(Boolean).join(" • ");
    }
    if (payload?.source === "walk_in") {
      return "Walk-in";
    }
    return ticket.reservationId ? `Reservation • ${ticket.reservationId}` : "Ticket";
  };

  const getTicketAccentColor = (ticket: KitchenTicket): string => {
    const payload = normalizeTicketPayload(ticket.items);
    const reservationId = ticket.reservationId || payload?.reservationId;
    return getReservationAccentColor(reservationId);
  };

  const renderTicketItems = (ticket: KitchenTicket) => {
    const payload = normalizeTicketPayload(ticket.items);
    const rawItems = payload?.items;

    if (Array.isArray(rawItems)) {
      if (rawItems.length === 0) {
        return <div style={{ fontSize: 12, color: "#6b7280" }}>No items.</div>;
      }

      // items can be strings (walk-in) or objects (reservation pre-order)
      if (typeof rawItems[0] === "string") {
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rawItems.map((line: string, idx: number) => (
              <div key={idx} style={{ fontSize: 13, color: "#111827", fontWeight: 700 }}>
                {line}
              </div>
            ))}
          </div>
        );
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rawItems.map((it: any, idx: number) => (
          <div key={it?.id || idx} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div
                style={{
                  fontSize: 13,
                  color: isDepartmentResponsibleForTicketItem(department, payload?.source, it?.isDrink)
                    ? "#16a34a"
                    : "#111827",
                  fontWeight: 900,
                }}
              >
                {String(it?.name || "Item")}
              </div>
              <div style={{ fontSize: 13, color: "#111827", fontWeight: 900 }}>
                x{typeof it?.qty === "number" ? it.qty : 1}
              </div>
            </div>
            {it?.notes ? <div style={{ fontSize: 12, color: "#6b7280" }}>{String(it.notes)}</div> : null}
            {Array.isArray(it?.addons) && it.addons.length > 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Addons: {it.addons.map((a: any) => `${a?.name || "addon"}${a?.qty ? ` x${a.qty}` : ""}`).join(", ")}
              </div>
            ) : null}
            {Array.isArray(it?.optionalIngredients) && it.optionalIngredients.length > 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Options: {it.optionalIngredients.map((o: any) => `${o?.isIncluded === false ? "No " : ""}${o?.name || ""}`).join(", ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      );
    }

    // Fallback
    return (
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        {typeof payload === "object" ? "No items field." : "No items."}
      </div>
    );
  };

  const moveStatus = async (ticketId: string, next: KitchenTicketStatus) => {
    try {
      const token = await getToken();
      if (!token) return;
      const updated = await kitchenTicketService.updateKitchenTicketStatus({ id: ticketId, status: next }, token);
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err: any) {
      console.error("Failed to update kitchen ticket status:", err);
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 40 }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>Tickets</div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : tickets.length === 0 ? (
        <div
          style={{
            padding: 24,
            borderRadius: 14,
            border: "1px dashed #e5e7eb",
            background: "#ffffff",
            color: "#6b7280",
          }}
        >
          No reservation tickets for today.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(280px, 1fr))",
            gap: 12,
            width: "100%",
            overflowX: "auto",
          }}
        >
          {reservationStatusColumns.map((col) => (
            <div
              key={col.key}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 320,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>{col.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>{byStatus[col.key].length}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {byStatus[col.key].map((t) => {
                  const canToPreparing = t.status === "NEW";
                  const canToReady = t.status === "PREPARING";
                  const canAbort = t.status !== "READY" && t.status !== "CANCELLED";
                  const payload = normalizeTicketPayload(t.items);
                  const reservationId = String(t.reservationId || payload?.reservationId || "").trim();
                  const resStatus = reservationId ? String(reservationStatusById[reservationId] || "").trim().toUpperCase() : "";
                  const isDone = col.key === "DONE" || resStatus === "COMPLETED";
                  return (
                    <div
                      key={t.id}
                      id={`kitchen-ticket-${t.id}`}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 12,
                        background: "#f9fafb",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 900, color: "#111827", minWidth: 0 }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: getTicketAccentColor(t),
                              marginRight: 8,
                              verticalAlign: "middle",
                            }}
                          />
                          {getTicketTitle(t)}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{t.status}</div>
                      </div>

                      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                        {t.reservationId ? `Reservation: ${t.reservationId}` : "Walk-in / Unknown reservation"}
                      </div>

                      <div style={{ marginTop: 10 }}>{renderTicketItems(t)}</div>

                      {isDone ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a", fontWeight: 900 }}>Done</div>
                      ) : null}

                      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {!isDone && canToPreparing ? (
                          <button
                            type="button"
                            onClick={() => void moveStatus(t.id, "PREPARING")}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #111827",
                              background: "#111827",
                              color: "#fff",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            Start preparing
                          </button>
                        ) : null}

                        {!isDone && canToReady ? (
                          <button
                            type="button"
                            onClick={() => void moveStatus(t.id, "READY")}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #111827",
                              background: "#fff",
                              color: "#111827",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            Mark ready
                          </button>
                        ) : null}

                        {!isDone && canAbort ? (
                          <button
                            type="button"
                            onClick={() => void moveStatus(t.id, "CANCELLED")}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #b91c1c",
                              background: "#fff",
                              color: "#b91c1c",
                              cursor: "pointer",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            Abort
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const KitchenWindowInner: React.FC = () => {
  const department = useDepartment();
  const { getToken } = useAuth();
  const { can, isSuperAdmin, isOrgAdmin } = usePermissions();
  const [searchParams] = useSearchParams();
  const { subscribe } = useAdminWebSocket();

  const canAccessKitchen = isSuperAdmin || isOrgAdmin || can(RESOURCES.KITCHEN, ACTIONS.VIEW);

  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [tab, setTab] = useState<TabKey>("DELIVERY");
  const [clockNow, setClockNow] = useState<Date>(() => new Date());

  const [deliveryUnfinished, setDeliveryUnfinished] = useState(0);
  const [pickupUnfinished, setPickupUnfinished] = useState(0);
  const [reservationUnfinished, setReservationUnfinished] = useState(0);

  const countsRetryRef = useRef(0);

  const [mergeNotices, setMergeNotices] = useState<Record<string, MergeNotice>>({});
  const [mergePulse, setMergePulse] = useState<Record<string, number>>({});

  const [branchUnfinishedCounts, setBranchUnfinishedCounts] = useState<Record<string, number>>({});
  const toastSeenRef = useRef<Record<string, number>>({});

  const [focusTarget, setFocusTarget] = useState<
    | {
        branchId: string;
        tab: TabKey;
        elementId: string;
      }
    | null
  >(null);

  const [orgVersion, setOrgVersion] = useState(0);

  useEffect(() => {
    const initialBranchId = String(searchParams.get("branchId") || "").trim();
    if (initialBranchId) {
      setSelectedBranchId(initialBranchId);
    }
  }, [searchParams]);

  useEffect(() => {
    const onOrgChange = () => setOrgVersion((v) => v + 1);
    window.addEventListener(ORG_CHANGED_EVENT, onOrgChange as EventListener);
    return () => window.removeEventListener(ORG_CHANGED_EVENT, onOrgChange as EventListener);
  }, []);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const token = await getToken();
        if (!token) {
          setBranches([]);
          return;
        }
        const list = await branchService.getBranches(token);
        const normalized = Array.isArray(list)
          ? list.map((b: any) => ({ id: String(b.id), name: String(b.name || "Branch") }))
          : [];
        setBranches(normalized);

        setSelectedBranchId((prev) => {
          const nextPrev = String(prev || "").trim();
          if (nextPrev && normalized.some((b) => b.id === nextPrev)) return nextPrev;
          return normalized[0]?.id || "";
        });
      } catch {
        setBranches([]);
      }
    };

    if (!canAccessKitchen) return;
    void loadBranches();
  }, [canAccessKitchen, getToken, orgVersion, selectedBranchId]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setClockNow(new Date());
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const todayKey = useMemo(() => getTodayKeyInRestaurantTz(), []);

  const isOrderTodayForBadge = (o: any): boolean => {
    const isScheduled = Boolean(o?.isScheduledOrder && o?.scheduledDate);
    if (isScheduled) {
      const d = getDateInRestaurantTz(String(o?.scheduledDate || ""));
      if (!d) return false;
      return getDateKeyInRestaurantTz(d) === todayKey;
    }
    return true;
  };

  const loadCountsForBranch = async (branchId: string): Promise<boolean> => {
    if (!branchId) return true;
    try {
      const token = (await getToken()) || undefined;
      if (!token) {
        return false;
      }

      const [deliveryResp, pickupResp, reservationsResp] = await Promise.all([
        orderService.getOrders(
          1,
          200,
          "",
          "createdAt",
          "desc",
          "",
          "",
          "",
          todayKey,
          todayKey,
          branchId,
          "",
          "DELIVERY",
          "all",
          "all",
          "",
          token
        ),
        orderService.getOrders(
          1,
          200,
          "",
          "createdAt",
          "desc",
          "",
          "",
          "",
          todayKey,
          todayKey,
          branchId,
          "",
          "PICKUP",
          "all",
          "all",
          "",
          token
        ),
        reservationService.getReservations(1, 200, { branchId, date: todayKey }, token),
      ]);

      const deliveryOrders = Array.isArray((deliveryResp as any)?.orders) ? (deliveryResp as any).orders : [];
      const pickupOrders = Array.isArray((pickupResp as any)?.orders) ? (pickupResp as any).orders : [];
      const resList = (reservationsResp as any)?.data?.reservations;
      const reservations = Array.isArray(resList) ? resList : [];

      const nextDelivery =
        department === "BAR"
          ? deliveryOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o) && orderHasDrinkItems(o)).length
          : deliveryOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o)).length;
      const nextPickup =
        department === "BAR"
          ? pickupOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o) && orderHasDrinkItems(o)).length
          : pickupOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o)).length;
      const nextReservations =
        department === "BAR"
          ? reservations
              .filter((r: any) => !isReservationDone(r))
              .filter((r: any) => String(r?.type || "").trim().toUpperCase() === "PRE_ORDER")
              .filter((r: any) => reservationHasDrinkItems(r)).length
          : reservations.filter((r: any) => !isReservationDone(r)).length;

      setDeliveryUnfinished(nextDelivery);
      setPickupUnfinished(nextPickup);
      setReservationUnfinished(nextReservations);
      return true;
    } catch {
      setDeliveryUnfinished(0);
      setPickupUnfinished(0);
      setReservationUnfinished(0);
      return true;
    }
  };

  useEffect(() => {
    if (!selectedBranchId) return;
    countsRetryRef.current = 0;
    let cancelled = false;

    const run = async () => {
      const ok = await loadCountsForBranch(selectedBranchId);
      if (cancelled) return;
      if (ok) return;
      countsRetryRef.current += 1;
      if (countsRetryRef.current > 5) return;
      window.setTimeout(() => {
        if (cancelled) return;
        void run();
      }, 750);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  const updateBranchUnfinishedCounts = async () => {
    try {
      const token = (await getToken()) || undefined;
      if (!token) {
        setBranchUnfinishedCounts({});
        return;
      }

      const next: Record<string, number> = {};
      for (const b of branches) {
        try {
          const [deliveryResp, pickupResp, reservationsResp] = await Promise.all([
            orderService.getOrders(
              1,
              200,
              "",
              "createdAt",
              "desc",
              "",
              "",
              "",
              todayKey,
              todayKey,
              b.id,
              "",
              "DELIVERY",
              "all",
              "all",
              "",
              token
            ),
            orderService.getOrders(
              1,
              200,
              "",
              "createdAt",
              "desc",
              "",
              "",
              "",
              todayKey,
              todayKey,
              b.id,
              "",
              "PICKUP",
              "all",
              "all",
              "",
              token
            ),
            reservationService.getReservations(1, 200, { branchId: b.id, date: todayKey }, token),
          ]);

          const deliveryOrders = Array.isArray((deliveryResp as any)?.orders) ? (deliveryResp as any).orders : [];
          const pickupOrders = Array.isArray((pickupResp as any)?.orders) ? (pickupResp as any).orders : [];
          const resList = (reservationsResp as any)?.data?.reservations;
          const reservations = Array.isArray(resList) ? resList : [];

          const unfinishedDelivery =
            department === "BAR"
              ? deliveryOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o) && orderHasDrinkItems(o)).length
              : deliveryOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o)).length;
          const unfinishedPickup =
            department === "BAR"
              ? pickupOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o) && orderHasDrinkItems(o)).length
              : pickupOrders.filter((o: any) => !isOrderDone(o) && isOrderTodayForBadge(o)).length;
          const unfinishedReservations =
            department === "BAR"
              ? reservations
                  .filter((r: any) => !isReservationDone(r))
                  .filter((r: any) => String(r?.type || "").trim().toUpperCase() === "PRE_ORDER")
                  .filter((r: any) => reservationHasDrinkItems(r)).length
              : reservations.filter((r: any) => !isReservationDone(r)).length;

          const unfinished = unfinishedDelivery + unfinishedPickup + unfinishedReservations;

          next[b.id] = unfinished;
        } catch {
          next[b.id] = 0;
        }
      }

      setBranchUnfinishedCounts(next);
    } catch {
      setBranchUnfinishedCounts({});
    }
  };

  useEffect(() => {
    if (!canAccessKitchen) return;
    if (!isOrgAdmin && !isSuperAdmin) return;
    if (branches.length === 0) return;
    void updateBranchUnfinishedCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, isOrgAdmin, isSuperAdmin, canAccessKitchen]);

  useEffect(() => {
    if (!canAccessKitchen) return;

    const getBranchName = (branchId: string): string => {
      const b = branches.find((x) => String(x.id) === String(branchId));
      return b?.name || "Branch";
    };

    const navigateTo = (branchId: string, tabKey: TabKey, elementId: string) => {
      if (branchId) setSelectedBranchId(String(branchId));
      setTab(tabKey);
      setFocusTarget({ branchId: String(branchId || ""), tab: tabKey, elementId });
    };

    const shouldToast = (key: string, ttlMs: number = 15_000): boolean => {
      const now = Date.now();
      const prev = toastSeenRef.current[key] || 0;
      if (now - prev < ttlMs) return false;
      toastSeenRef.current[key] = now;
      return true;
    };

    const onNewOrder = (payload: any) => {
      const order = payload?.order || payload;
      const branchId = getBranchIdFromPayload(payload);
      if (department === "BAR" && !orderHasDrinkItems(order)) return;
      const key = `new-order:${String(order?.id || "")}`;
      if (!shouldToast(key)) return;
      const orderType = String(order?.orderType || "").trim().toUpperCase();
      const tabKey: TabKey = orderType === "PICKUP" ? "PICKUP" : "DELIVERY";
      const elId = `kitchen-order-${String(order?.id || "")}`;
      toast.infoAction(`New order received • ${getBranchName(branchId)}`, () => navigateTo(branchId, tabKey, elId));
      void updateBranchUnfinishedCounts();
    };

    const onOrderUpdated = (payload: any) => {
      const order = payload?.order || payload;
      const branchId = getBranchIdFromPayload(payload);
      if (department === "BAR" && !orderHasDrinkItems(order)) return;

      const isMergeRequest = Boolean((payload as any)?.isMergeRequest);
      const newItems = Array.isArray((payload as any)?.newItems) ? (payload as any).newItems : [];
      if (isMergeRequest && newItems.length > 0) {
        const orderId = String(order?.id || "").trim();
        if (orderId) {
          setMergeNotices((prev) => ({
            ...prev,
            [orderId]: {
              orderId,
              createdAt: Date.now(),
              newItems,
            },
          }));

          const token = Date.now();
          setMergePulse((prev) => ({ ...prev, [orderId]: token }));
          window.setTimeout(() => {
            setMergePulse((prev) => {
              if (prev[orderId] !== token) return prev;
              const next = { ...prev };
              delete next[orderId];
              return next;
            });
          }, 2500);
        }

        const key = `order-merged:${String(order?.id || "")}`;
        if (!shouldToast(key)) return;
        const orderType = String(order?.orderType || "").trim().toUpperCase();
        const tabKey: TabKey = orderType === "PICKUP" ? "PICKUP" : "DELIVERY";
        const elId = `kitchen-order-${String(order?.id || "")}`;
        toast.infoAction(`Merged update • ${getBranchName(branchId)}`, () => navigateTo(branchId, tabKey, elId));
        void updateBranchUnfinishedCounts();
        return;
      }

      const status = String(order?.status || "").trim().toUpperCase();
      const key = `order-updated:${String(order?.id || "")}:${status}`;
      if (!shouldToast(key)) return;
      const orderType = String(order?.orderType || "").trim().toUpperCase();
      const tabKey: TabKey = orderType === "PICKUP" ? "PICKUP" : "DELIVERY";
      const elId = `kitchen-order-${String(order?.id || "")}`;
      toast.infoAction(`Order updated (${status}) • ${getBranchName(branchId)}`, () => navigateTo(branchId, tabKey, elId));
      void updateBranchUnfinishedCounts();
    };

    const onNewReservation = (payload: any) => {
      const reservation = payload?.reservation || payload;
      const branchId = getBranchIdFromPayload(payload);
      if (department === "BAR") {
        const type = String(reservation?.type || "").trim().toUpperCase();
        if (type !== "PRE_ORDER") return;
        if (!reservationHasDrinkItems(reservation)) return;
      }
      const key = `new-reservation:${String(reservation?.id || "")}`;
      if (!shouldToast(key)) return;
      const elId = `kitchen-reservation-${String(reservation?.id || "")}`;
      toast.infoAction(`New reservation received • ${getBranchName(branchId)}`, () => navigateTo(branchId, "RESERVATION", elId));
      void updateBranchUnfinishedCounts();
    };

    const onReservationUpdated = (payload: any) => {
      const reservation = payload?.reservation || payload;
      const branchId = getBranchIdFromPayload(payload);
      const status = String(reservation?.status || "").trim().toUpperCase();
      if (department === "BAR") {
        const type = String(reservation?.type || "").trim().toUpperCase();
        if (type !== "PRE_ORDER") return;
        if (!reservationHasDrinkItems(reservation)) return;
      }
      const key = `reservation-updated:${String(reservation?.id || "")}:${status}`;
      if (!shouldToast(key)) return;
      const elId = `kitchen-reservation-${String(reservation?.id || "")}`;
      toast.infoAction(
        `Reservation updated (${status}) • ${getBranchName(branchId)}`,
        () => navigateTo(branchId, "RESERVATION", elId)
      );
      void updateBranchUnfinishedCounts();
    };

    const onKitchenTicketCreated = (payload: any) => {
      const ticket = payload?.ticket || payload;
      const branchId = getBranchIdFromPayload(payload);
      const key = `kitchen-ticket-created:${String(ticket?.id || "")}`;
      if (!shouldToast(key)) return;
      const elId = `kitchen-ticket-${String(ticket?.id || "")}`;
      toast.infoAction(`New kitchen ticket • ${getBranchName(branchId)}`, () => navigateTo(branchId, "RESERVATION", elId));
    };

    const onKitchenTicketUpdated = (payload: any) => {
      const ticket = payload?.ticket || payload;
      const branchId = getBranchIdFromPayload(payload);
      const status = String(ticket?.status || "").trim().toUpperCase();
      const key = `kitchen-ticket-updated:${String(ticket?.id || "")}:${status}`;
      if (!shouldToast(key)) return;
      const elId = `kitchen-ticket-${String(ticket?.id || "")}`;
      toast.infoAction(
        `Kitchen ticket updated (${status}) • ${getBranchName(branchId)}`,
        () => navigateTo(branchId, "RESERVATION", elId)
      );
    };

    const u1 = subscribe("new-order", onNewOrder);
    const u2 = subscribe("order-updated", onOrderUpdated);
    const u3 = subscribe("new-reservation", onNewReservation);
    const u4 = subscribe("reservation-updated", onReservationUpdated);
    const u5 = subscribe("reservation-modified", onReservationUpdated);
    const u6 = subscribe("kitchen-ticket-created", onKitchenTicketCreated);
    const u7 = subscribe("kitchen-ticket-updated", onKitchenTicketUpdated);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, canAccessKitchen]);

  const acknowledgeMerge = (orderId: string) => {
    const key = String(orderId || "").trim();
    if (!key) return;
    setMergeNotices((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.branchId && String(focusTarget.branchId) !== String(selectedBranchId || "")) return;
    if (focusTarget.tab !== tab) return;

    const t = window.setTimeout(() => {
      try {
        const el = document.getElementById(focusTarget.elementId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const prevBoxShadow = (el as HTMLElement).style.boxShadow;
          const prevBorderColor = (el as HTMLElement).style.borderColor;
          const prevBackground = (el as HTMLElement).style.background;
          (el as HTMLElement).style.boxShadow = "0 0 0 3px rgba(245, 158, 11, 0.7)";
          (el as HTMLElement).style.borderColor = "#f59e0b";
          (el as HTMLElement).style.background = "#fffbeb";
          window.setTimeout(() => {
            try {
              (el as HTMLElement).style.boxShadow = prevBoxShadow;
              (el as HTMLElement).style.borderColor = prevBorderColor;
              (el as HTMLElement).style.background = prevBackground;
            } catch {
              // ignore
            }
          }, 2500);
        }
      } finally {
        setFocusTarget(null);
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [focusTarget, selectedBranchId, tab]);

  const clockText = useMemo(() => {
    try {
      return clockNow.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "";
    }
  }, [clockNow]);

  if (!canAccessKitchen) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            color: "#111827",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Kitchen access required</div>
          <div style={{ marginTop: 8, color: "#6b7280", lineHeight: 1.5 }}>
            You don’t have permission to access the Kitchen module.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background: "#f9fafb",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 72,
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#111827" }}>{department === "BAR" ? "Bar" : "Kitchen"}</div>
          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>
            {department === "BAR" ? "Branch-scoped real-time bar dashboard" : "Branch-scoped real-time kitchen dashboard"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontVariantNumeric: "tabular-nums",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              fontSize: 14,
              fontWeight: 900,
              color: "#111827",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              minWidth: 96,
              textAlign: "center",
            }}
          >
            {clockText}
          </div>
          <div style={{ minWidth: 240 }}>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
                      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.name}
                      </div>
                      {(isOrgAdmin || isSuperAdmin) && <Badge count={branchUnfinishedCounts[b.id] || 0} />}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TabButton
            active={tab === "DELIVERY"}
            title={deliveryUnfinished > 0 ? `Delivery (${deliveryUnfinished})` : "Delivery"}
            onClick={() => setTab("DELIVERY")}
          />
          <TabButton
            active={tab === "PICKUP"}
            title={pickupUnfinished > 0 ? `Pickup (${pickupUnfinished})` : "Pickup"}
            onClick={() => setTab("PICKUP")}
          />
          <TabButton
            active={tab === "RESERVATION"}
            title={reservationUnfinished > 0 ? `Reservation (${reservationUnfinished})` : "Reservation"}
            onClick={() => setTab("RESERVATION")}
          />
        </div>
      </div>

      </div>

      <div style={{ flex: 1, padding: 14, overflow: "auto" }}>
        {!selectedBranchId ? (
          <div
            style={{
              padding: 24,
              borderRadius: 14,
              border: "1px dashed #e5e7eb",
              background: "#ffffff",
              color: "#6b7280",
            }}
          >
            Select a branch to start.
          </div>
        ) : tab === "DELIVERY" ? (
          <KitchenDeliveryTab
            branchId={selectedBranchId}
            onDeliveryCountChange={setDeliveryUnfinished}
            mergeNotices={mergeNotices}
            mergePulse={mergePulse}
            onAcknowledgeMerge={acknowledgeMerge}
          />
        ) : tab === "PICKUP" ? (
          <KitchenPickupTab
            branchId={selectedBranchId}
            onPickupCountChange={setPickupUnfinished}
            mergeNotices={mergeNotices}
            mergePulse={mergePulse}
            onAcknowledgeMerge={acknowledgeMerge}
          />
        ) : (
          <KitchenReservationTab branchId={selectedBranchId} onReservationsCountChange={setReservationUnfinished} />
        )}
      </div>
    </div>
  );
};

const KitchenWindow: React.FC = () => {
  return (
    <AdminWebSocketProvider>
      <DepartmentContext.Provider value="KITCHEN">
        <KitchenWindowInner />
      </DepartmentContext.Provider>
    </AdminWebSocketProvider>
  );
};

export const KitchenLikeWindow: React.FC<{ department: Department }> = ({ department }) => {
  return (
    <AdminWebSocketProvider>
      <DepartmentContext.Provider value={department}>
        <KitchenWindowInner />
      </DepartmentContext.Provider>
    </AdminWebSocketProvider>
  );
};

export default KitchenWindow;
