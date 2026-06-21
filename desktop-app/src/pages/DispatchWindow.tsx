import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { AdminWebSocketProvider, useAdminWebSocket } from "../contexts/AdminWebSocketContext";
import branchService from "../services/branchService";
import { orderService, type Order } from "../services/orderService";
import { kitchenTicketService, type KitchenTicket, type KitchenTicketStatus } from "../services/kitchenTicketService";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { toast } from "../components/Toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

const getDateInRestaurantTz = (iso: string): Date | null => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const offsetMinutes = getRestaurantTimezoneOffsetMinutes();
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000;
    const tzMs = utcMs + offsetMinutes * 60_000;
    return new Date(tzMs);
  } catch {
    return null;
  }
};

const getDateKeyInRestaurantTz = (date: Date): string => {
  try {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
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

const isOrderCancelled = (o: any): boolean => {
  const statusRaw = String(o?.status || "").trim().toUpperCase();
  return statusRaw === "CANCELLED";
};

const isOrderDoneStatus = (o: any): boolean => {
  const statusRaw = String(o?.status || "").trim().toUpperCase();
  return statusRaw === "DELIVERED" || statusRaw === "PICKED_UP";
};

const orderHasDrinkItems = (order: any): boolean => {
  const items = Array.isArray((order as any)?.orderItems) ? (order as any).orderItems : [];
  return items.some((it: any) => Boolean(it?.meal?.isDrink));
};

const orderHasFoodItems = (order: any): boolean => {
  const items = Array.isArray((order as any)?.orderItems) ? (order as any).orderItems : [];
  return items.some((it: any) => it?.meal && it?.meal?.isDrink === false);
};

type TicketGroup = "KITCHEN" | "BAR";

const ticketSourcesFor = (orderType: string, group: TicketGroup): string[] => {
  const ot = String(orderType || "").trim().toUpperCase();
  if (group === "BAR") return ot === "DELIVERY" ? ["bar_delivery"] : ["bar_pickup"];
  return ot === "DELIVERY" ? ["delivery"] : ["pickup"];
};

const getLatestTicketForOrder = (tickets: KitchenTicket[], orderId: string, sources: string[]): KitchenTicket | null => {
  const orderIdNorm = String(orderId || "").trim();
  if (!orderIdNorm) return null;
  const srcSet = new Set(sources.map((s) => String(s).trim().toLowerCase()));

  const related = tickets
    .map((t) => {
      const payload = normalizeTicketPayload((t as any)?.items);
      const oid = String(payload?.orderId || "").trim();
      const src = String(payload?.source || "").trim().toLowerCase();
      return { t, oid, src };
    })
    .filter((x) => x.oid === orderIdNorm)
    .filter((x) => srcSet.has(x.src));

  if (related.length === 0) return null;
  related.sort((a: any, b: any) => {
    const at = new Date(String((a.t as any)?.createdAt || 0)).getTime();
    const bt = new Date(String((b.t as any)?.createdAt || 0)).getTime();
    return bt - at;
  });
  return related[0].t;
};

const statusColor = (status: string): string => {
  const s = String(status || "").trim().toUpperCase();
  if (s === "READY") return "#16a34a";
  if (s === "PREPARING") return "#111827";
  if (s === "NEW") return "#111827";
  if (s === "CANCELLED") return "#b91c1c";
  return "#6b7280";
};

const DispatchWindowInner: React.FC = () => {
  const { getToken } = useAuth();
  const { can, isSuperAdmin, isOrgAdmin } = usePermissions();
  const { subscribe, isConnected } = useAdminWebSocket();
  const [searchParams] = useSearchParams();

  const canAccessDispatch = isSuperAdmin || isOrgAdmin || can(RESOURCES.DISPATCH, ACTIONS.VIEW);

  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branchBadgeCounts, setBranchBadgeCounts] = useState<Record<string, number>>({});

  const [clockNow, setClockNow] = useState<Date>(() => new Date());

  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);

  const [movingTicketId, setMovingTicketId] = useState<string | null>(null);
  const [creatingTicketKey, setCreatingTicketKey] = useState<string | null>(null);
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null);

  const [mergeNotices, setMergeNotices] = useState<Record<string, { orderId: string; createdAt: number; newItems: any[] }>>({});
  const [mergePulse, setMergePulse] = useState<Record<string, number>>({});

  const [tooEarlyDialogOpen, setTooEarlyDialogOpen] = useState(false);
  const [tooEarlyDialogText, setTooEarlyDialogText] = useState<{ title: string; description: string } | null>(null);
  const tooEarlyDialogResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmDialogText, setConfirmDialogText] = useState<{ title: string; description: string; orderId: string } | null>(null);
  const confirmDialogResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const [confirmedOrderIds, setConfirmedOrderIds] = useState<Record<string, boolean>>({});

  const latestFetchRef = useRef(0);
  const todayKey = useMemo(() => getTodayKeyInRestaurantTz(), []);

  const [activeOrderType, setActiveOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");

  useEffect(() => {
    const t = window.setInterval(() => {
      setClockNow(new Date());
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const clockText = useMemo(() => {
    try {
      return clockNow.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  }, [clockNow]);

  const isOrderActiveForBadge = (o: any): boolean => {
    const s = String(o?.status || "").trim().toUpperCase();
    return s !== "DELIVERED" && s !== "PICKED_UP" && s !== "CANCELLED";
  };

  const badgeCounts = useMemo(() => {
    const isOrderTodayForBadge = (o: any): boolean => {
      const isScheduled = Boolean(o?.isScheduledOrder && o?.scheduledDate);
      if (isScheduled) {
        const d = getDateInRestaurantTz(String(o?.scheduledDate || ""));
        if (!d) return false;
        return getDateKeyInRestaurantTz(d) === todayKey;
      }
      return true;
    };

    const counts: Record<"DELIVERY" | "PICKUP", number> = { DELIVERY: 0, PICKUP: 0 };
    for (const o of orders) {
      const t = String(o?.orderType || "").trim().toUpperCase();
      if (t !== "DELIVERY" && t !== "PICKUP") continue;
      if (!isOrderActiveForBadge(o)) continue;
      if (!isOrderTodayForBadge(o)) continue;
      counts[t as "DELIVERY" | "PICKUP"] += 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, todayKey]);

  useEffect(() => {
    const initialBranchId = String(searchParams.get("branchId") || "").trim();
    if (initialBranchId) setSelectedBranchId(initialBranchId);
  }, [searchParams]);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const token = await getToken();
        if (!token) {
          setBranches([]);
          return;
        }
        const list = await branchService.getBranches(token);
        const normalized = Array.isArray(list) ? list.map((b: any) => ({ id: String(b.id), name: String(b.name || "Branch") })) : [];
        setBranches(normalized);
        if (!selectedBranchId && normalized.length === 1) setSelectedBranchId(normalized[0].id);
        if (!selectedBranchId && normalized.length > 0) setSelectedBranchId(normalized[0].id);
      } catch (err: any) {
        console.error("Dispatch: failed to load branches", err?.response?.status, err?.response?.data || err);
        toast.error("Failed to load branches");
        setBranches([]);
      }
    };

    if (!canAccessDispatch) return;
    void loadBranches();
  }, [canAccessDispatch, getToken, selectedBranchId]);

  useEffect(() => {
    if (!canAccessDispatch) return;
    if (!branches || branches.length === 0) return;
    void loadBranchBadgeCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, canAccessDispatch]);

  const showTooEarlyDialog = async (params: { title: string; description: string }): Promise<boolean> => {
    setTooEarlyDialogText(params);
    setTooEarlyDialogOpen(true);
    return await new Promise<boolean>((resolve) => {
      tooEarlyDialogResolveRef.current = resolve;
    });
  };

  const showConfirmDialog = async (params: { title: string; description: string; orderId: string }): Promise<boolean> => {
    setConfirmDialogText(params);
    setConfirmDialogOpen(true);
    return await new Promise<boolean>((resolve) => {
      confirmDialogResolveRef.current = resolve;
    });
  };

  const isOrderTodayForQueue = (o: any): boolean => {
    const isScheduled = Boolean(o?.isScheduledOrder && o?.scheduledDate);
    if (isScheduled) {
      const d = getDateInRestaurantTz(String(o?.scheduledDate || ""));
      if (!d) return false;
      return getDateKeyInRestaurantTz(d) === todayKey;
    }
    return true;
  };

  const isOrderCreatedToday = (o: any): boolean => {
    const createdAt = String(o?.createdAt || "").trim();
    if (!createdAt) return false;
    const d = getDateInRestaurantTz(createdAt);
    if (!d) return false;
    return getDateKeyInRestaurantTz(d) === todayKey;
  };

  const loadBranchBadgeCounts = async () => {
    try {
      const token = (await getToken()) || undefined;
      if (!token) {
        setBranchBadgeCounts({});
        return;
      }
      if (!branches || branches.length === 0) {
        setBranchBadgeCounts({});
        return;
      }

      const fetchForType = async (branchId: string, orderType: "DELIVERY" | "PICKUP"): Promise<any[]> => {
        const asapPromise = orderService.getDispatchOrders(
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
          orderType,
          "asap",
          "",
          token
        );
        const scheduledPromise = orderService.getDispatchOrders(
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
          orderType,
          "scheduled",
          "",
          token
        );
        const [asapResp, scheduledResp] = await Promise.all([asapPromise, scheduledPromise]);
        const normalizedAsap = Array.isArray((asapResp as any)?.orders) ? (asapResp as any).orders : [];
        const normalizedScheduled = Array.isArray((scheduledResp as any)?.orders) ? (scheduledResp as any).orders : [];
        const combined = [...normalizedAsap, ...normalizedScheduled];
        const byId = new Map<string, any>();
        for (const o of combined) {
          if (!o?.id) continue;
          if (!byId.has(o.id)) byId.set(o.id, o);
        }
        return Array.from(byId.values());
      };

      const next: Record<string, number> = {};
      await Promise.all(
        branches.map(async (b) => {
          try {
            const [delivery, pickup] = await Promise.all([fetchForType(b.id, "DELIVERY"), fetchForType(b.id, "PICKUP")]);
            const merged = [...delivery, ...pickup]
              .filter((o: any) => isOrderActiveForBadge(o))
              .filter((o: any) => isOrderTodayForQueue(o));
            next[String(b.id)] = merged.length;
          } catch {
            next[String(b.id)] = 0;
          }
        })
      );

      setBranchBadgeCounts(next);
    } catch {
      setBranchBadgeCounts({});
    }
  };

  const loadOrders = async () => {
    const now = Date.now();
    latestFetchRef.current = now;

    try {
      setLoading(true);
      const token = (await getToken()) || undefined;

      const fetchForType = async (orderType: "DELIVERY" | "PICKUP"): Promise<any[]> => {
        const asapPromise = orderService.getDispatchOrders(1, 200, "", "createdAt", "desc", "", "", "", todayKey, todayKey, selectedBranchId, "", orderType, "asap", "", token);
        const scheduledPromise = orderService.getDispatchOrders(1, 200, "", "scheduledDate", "asc", "", "", "", undefined, undefined, selectedBranchId, "", orderType, "scheduled", "", token);

        const [asapResp, scheduledResp] = await Promise.all([asapPromise, scheduledPromise]);
        const normalizedAsap = Array.isArray(asapResp?.orders) ? asapResp.orders : [];
        const normalizedScheduled = Array.isArray(scheduledResp?.orders) ? scheduledResp.orders : [];

        const combined = [...normalizedAsap, ...normalizedScheduled];
        const byId = new Map<string, any>();
        for (const o of combined) {
          if (!o?.id) continue;
          if (!byId.has(o.id)) byId.set(o.id, o);
        }
        return Array.from(byId.values());
      };

      const [delivery, pickup] = await Promise.all([fetchForType("DELIVERY"), fetchForType("PICKUP")]);
      if (latestFetchRef.current !== now) return;

      const merged = [...delivery, ...pickup]
        .filter((o: any) => !isOrderCancelled(o))
        .filter((o: any) => {
          if (isOrderDoneStatus(o)) {
            return isOrderCreatedToday(o) || isOrderTodayForQueue(o);
          }
          return isOrderTodayForQueue(o);
        });

      merged.sort((a: any, b: any) => {
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

      setOrders(merged);
    } catch (err: any) {
      if (latestFetchRef.current !== now) return;
      console.error(
        "Dispatch: failed to load orders",
        {
          selectedBranchId,
          todayKey,
          status: err?.response?.status,
          data: err?.response?.data,
        },
        err
      );

      const status = err?.response?.status;
      const msg =
        (err?.response?.data as any)?.error ||
        (err?.response?.data as any)?.message ||
        (typeof err?.message === "string" ? err.message : "Failed to load orders");

      toast.error(status ? `Failed to load orders (${status})` : "Failed to load orders", msg);
      setOrders([]);
    } finally {
      if (latestFetchRef.current !== now) return;
      setLoading(false);
    }
  };

  const moveDeliveryOrderStatus = async (order: any, next: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      const isScheduled = Boolean(order?.isScheduledOrder && order?.scheduledDate);
      if (isScheduled) {
        const nowTz = getNowInRestaurantTz();
        const scheduledTz = getDateInRestaurantTz(String(order?.scheduledDate || ""));
        if (scheduledTz) {
          const diffMs = scheduledTz.getTime() - nowTz.getTime();
          const oneHourMs = 60 * 60_000;
          if (diffMs > oneHourMs) {
            const nowText = formatTimeHHmm(nowTz);
            const schText = formatTimeHHmm(scheduledTz);
            const ok = await showTooEarlyDialog({
              title: "Prepare early?",
              description: `This order is scheduled for ${schText}. Current time is ${nowText}. Are you sure you want to continue?`,
            });
            if (!ok) return;
          }
        }
      }

      setMovingOrderId(order?.id || null);
      await orderService.updateOrderStatus(String(order.id), next as any, token);
    } catch {
      toast.error("Failed to update order status");
    } finally {
      setMovingOrderId(null);
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
      const list = await kitchenTicketService.listKitchenTickets({ branchId: selectedBranchId, date: todayKey }, token);
      setTickets(Array.isArray(list) ? list : []);
    } catch {
      setTickets([]);
    } finally {
      setTicketLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBranchId) return;
    void loadOrders();
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) return;

    const matchesBranch = (payload: any): boolean => {
      const order = payload?.order || payload;
      const bId = order?.branch?.id || order?.branchId;
      return bId && String(bId) === String(selectedBranchId);
    };

    const unsubNew = subscribe("new-order", (payload: any) => {
      if (!matchesBranch(payload)) return;
      const o = payload?.order;
      const t = String(o?.orderType || "").trim().toUpperCase();
      if (t !== "DELIVERY" && t !== "PICKUP") return;
      void loadOrders();
      void loadBranchBadgeCounts();
    });

    const unsubUpd = subscribe("order-updated", (payload: any) => {
      if (!matchesBranch(payload)) return;
      const o = payload?.order;
      const t = String(o?.orderType || "").trim().toUpperCase();
      if (t !== "DELIVERY" && t !== "PICKUP") return;

      const isMergeRequest = Boolean((payload as any)?.isMergeRequest);
      const newItems = Array.isArray((payload as any)?.newItems) ? (payload as any).newItems : [];
      if (isMergeRequest && newItems.length > 0) {
        const orderId = String(o?.id || "").trim();
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

          toast.infoAction(`Merged update • #${String(o?.orderNumber || "")}`.trim(), () => {
            try {
              const el = document.getElementById(`dispatch-order-${orderId}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch {
              // ignore
            }
          });
        }
      }

      void loadOrders();
      void loadBranchBadgeCounts();
    });

    const unsubTicketCreated = subscribe("kitchen-ticket-created", (payload: any) => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      if (!bId || String(bId) !== String(selectedBranchId)) return;
      void loadTickets();
    });

    const unsubTicketUpdated = subscribe("kitchen-ticket-updated", (payload: any) => {
      const ticket = payload?.ticket || payload;
      const bId = ticket?.branchId;
      if (!bId || String(bId) !== String(selectedBranchId)) return;
      void loadTickets();
    });

    return () => {
      unsubNew();
      unsubUpd();
      unsubTicketCreated();
      unsubTicketUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, subscribe]);

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

  const moveTicketStatus = async (ticketId: string, next: KitchenTicketStatus, order: any) => {
    try {
      const token = await getToken();
      if (!token) return;

      const isScheduled = Boolean(order?.isScheduledOrder && order?.scheduledDate);
      if (isScheduled) {
        const nowTz = getNowInRestaurantTz();
        const scheduledTz = getDateInRestaurantTz(String(order?.scheduledDate || ""));
        if (scheduledTz) {
          const diffMs = scheduledTz.getTime() - nowTz.getTime();
          const oneHourMs = 60 * 60_000;
          if (diffMs > oneHourMs) {
            const nowText = formatTimeHHmm(nowTz);
            const schText = formatTimeHHmm(scheduledTz);
            const ok = await showTooEarlyDialog({
              title: "Prepare early?",
              description: `This order is scheduled for ${schText}. Current time is ${nowText}. Are you sure you want to prepare it now?`,
            });
            if (!ok) return;
          }
        }
      }

      setMovingTicketId(ticketId);
      await kitchenTicketService.updateKitchenTicketStatus({ id: ticketId, status: next }, token);
    } catch {
      toast.error("Failed to update ticket status");
    } finally {
      setMovingTicketId(null);
    }
  };

  const createTicketForOrder = async (order: any, group: TicketGroup) => {
    try {
      const token = await getToken();
      if (!token) return;

      const orderType = String(order?.orderType || "").trim().toUpperCase();
      const source = group === "BAR" ? (orderType === "DELIVERY" ? "bar_delivery" : "bar_pickup") : orderType === "DELIVERY" ? "delivery" : "pickup";

      const allowedItems = Array.isArray(order?.orderItems)
        ? order.orderItems.filter((it: any) => (group === "BAR" ? Boolean(it?.meal?.isDrink) : it?.meal?.isDrink === false))
        : [];

      const mappedItems = allowedItems.map((it: any) => ({
        id: it?.id,
        name: it?.meal?.name,
        isDrink: (it as any)?.meal?.isDrink,
        qty: it?.quantity,
        selectedSize: it?.selectedSize,
        notes: it?.specialInstructions || undefined,
        addons: Array.isArray(it?.orderItemAddOns)
          ? it.orderItemAddOns.map((a: any) => ({ name: a?.addOnName, qty: a?.quantity }))
          : [],
        optionalIngredients: Array.isArray(it?.orderItemOptionalIngredients)
          ? it.orderItemOptionalIngredients.map((o: any) => ({ name: o?.ingredientName, isIncluded: o?.isIncluded }))
          : [],
      }));

      if (!mappedItems || mappedItems.length === 0) {
        toast.info(group === "BAR" ? "No drink items for Bar." : "No food items for Kitchen.");
        return;
      }

      const isScheduled = Boolean(order?.isScheduledOrder && order?.scheduledDate);
      if (isScheduled) {
        const nowTz = getNowInRestaurantTz();
        const scheduledTz = getDateInRestaurantTz(String(order?.scheduledDate || ""));
        if (scheduledTz) {
          const diffMs = scheduledTz.getTime() - nowTz.getTime();
          const oneHourMs = 60 * 60_000;
          if (diffMs > oneHourMs) {
            const nowText = formatTimeHHmm(nowTz);
            const schText = formatTimeHHmm(scheduledTz);
            const ok = await showTooEarlyDialog({
              title: "Prepare early?",
              description: `This order is scheduled for ${schText}. Current time is ${nowText}. Are you sure you want to prepare it now?`,
            });
            if (!ok) return;
          }
        }
      }

      const key = `${group}:${String(order?.id || "")}`;
      setCreatingTicketKey(key);

      const payload = {
        source,
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId: selectedBranchId,
        items: mappedItems,
      };

      await kitchenTicketService.createKitchenTicket({ branchId: selectedBranchId, reservationId: null, items: payload }, token);
    } catch {
      toast.error("Failed to create ticket");
    } finally {
      setCreatingTicketKey(null);
    }
  };

  const onConfirmParcel = async (order: any) => {
    const orderType = String(order?.orderType || "").trim().toUpperCase();
    const hasFood = orderHasFoodItems(order);
    const hasDrink = orderHasDrinkItems(order);

    const kitchenTicket = getLatestTicketForOrder(tickets, order.id, ticketSourcesFor(orderType, "KITCHEN"));
    const barTicket = getLatestTicketForOrder(tickets, order.id, ticketSourcesFor(orderType, "BAR"));

    const kitchenReady = !hasFood || (kitchenTicket && String(kitchenTicket.status).toUpperCase() === "READY");
    const barReady = !hasDrink || (barTicket && String(barTicket.status).toUpperCase() === "READY");

    if (!kitchenReady || !barReady) {
      const missing: string[] = [];
      if (!kitchenReady) missing.push("Kitchen is not READY");
      if (!barReady) missing.push("Bar is not READY");

      const ok = await showConfirmDialog({
        title: "Not all tickets are ready",
        description: `${missing.join(". ")}. Confirm anyway?`,
        orderId: order.id,
      });
      if (!ok) return;
    }

    setConfirmedOrderIds((prev) => ({ ...prev, [order.id]: true }));
    toast.success("Confirmed for parcel");
  };

  const getOrderStageKey = (o: any): string => {
    const orderType = String(o?.orderType || "").trim().toUpperCase();
    const status = String(o?.status || "").trim().toUpperCase();

    if (status === "DELIVERED" || status === "PICKED_UP") return "DONE";

    if (orderType === "DELIVERY") {
      if (status === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
      if (status === "READY_FOR_DELIVERY") return "READY";
      if (status === "PREPARING") return "PREPARING";
      return "CONFIRMED";
    }

    if (status === "READY_FOR_PICKUP") return "READY";
    if (status === "PREPARING") return "PREPARING";
    return "CONFIRMED";
  };

  const stageDefs = useMemo(() => {
    return activeOrderType === "DELIVERY"
      ? [
          { key: "CONFIRMED", title: "Confirmed" },
          { key: "PREPARING", title: "Preparing" },
          { key: "READY", title: "Ready" },
          { key: "OUT_FOR_DELIVERY", title: "Out for delivery" },
          { key: "DONE", title: "Done" },
        ]
      : [
          { key: "CONFIRMED", title: "Confirmed" },
          { key: "PREPARING", title: "Preparing" },
          { key: "READY", title: "Ready" },
          { key: "DONE", title: "Done" },
        ];
  }, [activeOrderType]);

  const ordersForActiveType = useMemo(() => {
    return orders
      .filter((o: any) => String(o?.orderType || "").trim().toUpperCase() === activeOrderType)
      .filter((o: any) => {
        if (!isOrderDoneStatus(o)) return true;
        return isOrderCreatedToday(o) || isOrderTodayForQueue(o);
      });
  }, [activeOrderType, orders]);

  const ordersByStage = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of stageDefs) map.set(s.key, []);
    for (const o of ordersForActiveType) {
      const k = getOrderStageKey(o);
      if (!map.has(k)) map.set(k, []);
      map.get(k)?.push(o);
    }

    for (const [k, list] of map) {
      list.sort((a: any, b: any) => {
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
      map.set(k, list);
    }
    return map;
  }, [ordersForActiveType, stageDefs]);

  if (!canAccessDispatch) {
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
          <div style={{ fontWeight: 900, fontSize: 18 }}>Dispatch access required</div>
          <div style={{ marginTop: 8, color: "#6b7280", lineHeight: 1.5 }}>
            You don’t have permission to access Dispatch.
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

      <Dialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialogOpen(false);
            setConfirmDialogText(null);
            const resolve = confirmDialogResolveRef.current;
            confirmDialogResolveRef.current = null;
            resolve?.(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialogText?.title || "Confirm"}</DialogTitle>
            <DialogDescription>{confirmDialogText?.description || ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmDialogOpen(false);
                setConfirmDialogText(null);
                const resolve = confirmDialogResolveRef.current;
                confirmDialogResolveRef.current = null;
                resolve?.(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmDialogOpen(false);
                setConfirmDialogText(null);
                const resolve = confirmDialogResolveRef.current;
                confirmDialogResolveRef.current = null;
                resolve?.(true);
              }}
            >
              Confirm anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <div style={{ fontSize: 20, fontWeight: 900, color: "#111827" }}>Dispatch</div>
          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>Today’s pickup + delivery handoff checklist</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 16,
              color: "#111827",
              minWidth: 110,
              textAlign: "center",
            }}
          >
            {clockText}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setActiveOrderType("DELIVERY")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: activeOrderType === "DELIVERY" ? "#111827" : "#fff",
                color: activeOrderType === "DELIVERY" ? "#fff" : "#111827",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Delivery
              {badgeCounts.DELIVERY > 0 ? (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: activeOrderType === "DELIVERY" ? "#ffffff" : "#111827",
                    color: activeOrderType === "DELIVERY" ? "#111827" : "#ffffff",
                    fontSize: 12,
                    fontWeight: 950,
                    lineHeight: "18px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {badgeCounts.DELIVERY > 99 ? "99+" : badgeCounts.DELIVERY}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveOrderType("PICKUP")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: activeOrderType === "PICKUP" ? "#111827" : "#fff",
                color: activeOrderType === "PICKUP" ? "#fff" : "#111827",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Pickup
              {badgeCounts.PICKUP > 0 ? (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: activeOrderType === "PICKUP" ? "#ffffff" : "#111827",
                    color: activeOrderType === "PICKUP" ? "#111827" : "#ffffff",
                    fontSize: 12,
                    fontWeight: 950,
                    lineHeight: "18px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {badgeCounts.PICKUP > 99 ? "99+" : badgeCounts.PICKUP}
                </span>
              ) : null}
            </button>
          </div>

          <div style={{ fontSize: 13, color: "#6b7280" }}>{isConnected ? "Realtime connected" : "Realtime disconnected"}</div>

          <div style={{ minWidth: 260 }}>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => {
                  const count = branchBadgeCounts[String(b.id)] || 0;
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
                        <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                        {count > 0 ? (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "#111827",
                              color: "#ffffff",
                              fontSize: 12,
                              fontWeight: 950,
                              lineHeight: "18px",
                              fontVariantNumeric: "tabular-nums",
                              flexShrink: 0,
                            }}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!selectedBranchId) return;
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
      </div>

      <div style={{ flex: 1, padding: 14, overflow: "hidden", display: "flex" }}>
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
        ) : loading ? (
          <div style={{ color: "#6b7280" }}>Loading…</div>
        ) : ordersForActiveType.length === 0 ? (
          <div
            style={{
              padding: 24,
              borderRadius: 14,
              border: "1px dashed #e5e7eb",
              background: "#ffffff",
              color: "#6b7280",
            }}
          >
            No {activeOrderType.toLowerCase()} orders for today.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "stretch", overflowX: "auto", paddingBottom: 6, width: "100%" }}>
            {stageDefs.map((stage) => {
              const stageOrders = ordersByStage.get(stage.key) || [];
              return (
                <div
                  key={stage.key}
                  style={{
                    minWidth: 360,
                    maxWidth: 420,
                    flex: "0 0 360px",
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <div style={{ fontWeight: 950, color: "#111827" }}>{stage.title}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>{stageOrders.length}</div>
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      overflowY: "auto",
                      flex: 1,
                      minHeight: 0,
                      paddingRight: 2,
                    }}
                  >
                    {stageOrders.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>No orders</div>
                    ) : (
                      stageOrders.map((o: any) => {
                        const orderType = String(o?.orderType || "").trim().toUpperCase();
                        const hasFood = orderHasFoodItems(o);
                        const hasDrink = orderHasDrinkItems(o);

                        const orderItems = Array.isArray((o as any)?.orderItems) ? (o as any).orderItems : [];

                        const orderStatus = String(o?.status || "").trim().toUpperCase();
                        const isDelivery = orderType === "DELIVERY";

                        const kitchenTicket = getLatestTicketForOrder(tickets, o.id, ticketSourcesFor(orderType, "KITCHEN"));
                        const barTicket = getLatestTicketForOrder(tickets, o.id, ticketSourcesFor(orderType, "BAR"));

                        const kitchenReady = !hasFood || (kitchenTicket && String(kitchenTicket.status).toUpperCase() === "READY");
                        const barReady = !hasDrink || (barTicket && String(barTicket.status).toUpperCase() === "READY");
                        const isReadyToParcel = kitchenReady && barReady;

                        const isScheduled = Boolean(o?.isScheduledOrder && o?.scheduledDate);
                        const scheduledTz = isScheduled ? getDateInRestaurantTz(String(o?.scheduledDate || "")) : null;
                        const canPrep = isScheduled ? isWithinOneHourTo(scheduledTz) : false;

                        const confirmDone = Boolean(confirmedOrderIds[o.id]);
                        const createDisabled = Boolean(creatingTicketKey === `KITCHEN:${o.id}` || creatingTicketKey === `BAR:${o.id}`);

                        const canMoveToPreparing = isDelivery && (orderStatus === "CONFIRMED" || orderStatus === "PENDING");
                        const canMoveToReady = isDelivery && orderStatus === "PREPARING";
                        const canMoveToOutForDelivery = isDelivery && orderStatus === "READY_FOR_DELIVERY";

                        const mergeNotice = mergeNotices[String(o.id)];
                        const isMergePulsing = Boolean(mergePulse[String(o.id)]);

                        return (
                          <div
                            key={o.id}
                            id={`dispatch-order-${String(o.id)}`}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 12,
                              padding: 12,
                              background: isMergePulsing ? "#fffbeb" : "#f9fafb",
                              borderColor: isMergePulsing ? "#f59e0b" : "#e5e7eb",
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
                                    onClick={() => acknowledgeMerge(String(o.id))}
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
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 950, color: "#111827" }}>#{o.orderNumber}</div>
                                <div style={{ marginTop: 2, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{String(o.status || "").toUpperCase()}</div>
                                <div style={{ marginTop: 4, fontSize: 12, color: canPrep ? "#16a34a" : "#6b7280", fontWeight: 900 }}>
                                  {isScheduled ? `Scheduled${scheduledTz ? ` • ${formatTimeHHmm(scheduledTz)}` : ""}` : "ASAP"}
                                </div>
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, color: isReadyToParcel ? "#16a34a" : "#f59e0b" }}>
                                  {isReadyToParcel ? "Ready" : "Not ready"}
                                </div>
                                {confirmDone ? <div style={{ fontSize: 12, fontWeight: 900, color: "#16a34a" }}>Confirmed</div> : null}
                              </div>
                            </div>

                            {orderItems.length > 0 ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 12,
                                  padding: 10,
                                  background: "#ffffff",
                                }}
                              >
                                <div style={{ fontWeight: 950, color: "#111827", fontSize: 12 }}>Items</div>
                                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                                  {orderItems.map((it: any, idx: number) => {
                                    const name = it?.meal?.name || "Item";
                                    const qty = typeof it?.quantity === "number" ? it.quantity : 1;
                                    const size = String(it?.selectedSize || "").trim();
                                    const notes = String(it?.specialInstructions || "").trim();
                                    const addons = Array.isArray(it?.orderItemAddOns)
                                      ? it.orderItemAddOns
                                          .map((a: any) => {
                                            const n = String(a?.addOnName || "").trim();
                                            const q = typeof a?.quantity === "number" ? a.quantity : 0;
                                            if (!n) return "";
                                            return q > 1 ? `${n} x${q}` : n;
                                          })
                                          .filter(Boolean)
                                      : [];
                                    const optionals = Array.isArray(it?.orderItemOptionalIngredients)
                                      ? it.orderItemOptionalIngredients
                                          .map((o2: any) => {
                                            const n = String(o2?.ingredientName || "").trim();
                                            if (!n) return "";
                                            const included = Boolean(o2?.isIncluded);
                                            return included ? n : `No ${n}`;
                                          })
                                          .filter(Boolean)
                                      : [];

                                    return (
                                      <div key={String(it?.id || idx)} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                                          <div style={{ fontWeight: 950, color: "#111827", fontSize: 13, minWidth: 0 }}>
                                            {qty}x {name}
                                          </div>
                                          {size ? (
                                            <div style={{ fontSize: 12, fontWeight: 900, color: "#6b7280", whiteSpace: "nowrap" }}>{size}</div>
                                          ) : null}
                                        </div>
                                        {notes ? <div style={{ fontSize: 12, color: "#6b7280" }}>{notes}</div> : null}
                                        {addons.length > 0 ? (
                                          <div style={{ fontSize: 12, color: "#6b7280" }}>+ {addons.join(", ")}</div>
                                        ) : null}
                                        {optionals.length > 0 ? (
                                          <div style={{ fontSize: 12, color: "#6b7280" }}>{optionals.join(", ")}</div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}

                            {isDelivery ? (
                              <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                {canMoveToPreparing ? (
                                  <button
                                    type="button"
                                    disabled={movingOrderId === o.id}
                                    onClick={() => void moveDeliveryOrderStatus(o, "PREPARING")}
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #111827",
                                      background: "#111827",
                                      color: "#fff",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      opacity: movingOrderId === o.id ? 0.7 : 1,
                                    }}
                                  >
                                    Start preparing
                                  </button>
                                ) : null}
                                {canMoveToReady ? (
                                  <button
                                    type="button"
                                    disabled={movingOrderId === o.id}
                                    onClick={() => void moveDeliveryOrderStatus(o, "READY_FOR_DELIVERY")}
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #111827",
                                      background: "#fff",
                                      color: "#111827",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      opacity: movingOrderId === o.id ? 0.7 : 1,
                                    }}
                                  >
                                    Ready
                                  </button>
                                ) : null}
                                {canMoveToOutForDelivery ? (
                                  <button
                                    type="button"
                                    disabled={movingOrderId === o.id}
                                    onClick={() => void moveDeliveryOrderStatus(o, "OUT_FOR_DELIVERY")}
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #111827",
                                      background: "#fff",
                                      color: "#111827",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      opacity: movingOrderId === o.id ? 0.7 : 1,
                                    }}
                                  >
                                    Out
                                  </button>
                                ) : null}
                              </div>
                            ) : null}

                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                <div style={{ fontWeight: 950, color: "#111827" }}>Kitchen</div>
                                <div style={{ fontSize: 12, fontWeight: 900, color: statusColor(kitchenTicket?.status || (hasFood ? "NO" : "READY")) }}>
                                  {ticketLoading ? "Loading…" : !hasFood ? "Not required" : kitchenTicket ? kitchenTicket.status : "No ticket"}
                                </div>
                              </div>
                              {!hasFood ? null : kitchenTicket ? (
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                  {kitchenTicket.status === "NEW" ? (
                                    <button
                                      type="button"
                                      disabled={movingTicketId === kitchenTicket.id}
                                      onClick={() => void moveTicketStatus(kitchenTicket.id, "PREPARING", o)}
                                      style={{
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: "1px solid #111827",
                                        background: "#111827",
                                        color: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                        fontSize: 12,
                                        opacity: movingTicketId === kitchenTicket.id ? 0.7 : 1,
                                      }}
                                    >
                                      Start
                                    </button>
                                  ) : null}
                                  {kitchenTicket.status === "PREPARING" ? (
                                    <button
                                      type="button"
                                      disabled={movingTicketId === kitchenTicket.id}
                                      onClick={() => void moveTicketStatus(kitchenTicket.id, "READY", o)}
                                      style={{
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: "1px solid #111827",
                                        background: "#fff",
                                        color: "#111827",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                        fontSize: 12,
                                        opacity: movingTicketId === kitchenTicket.id ? 0.7 : 1,
                                      }}
                                    >
                                      Ready
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    disabled={createDisabled}
                                    onClick={() => void createTicketForOrder(o, "KITCHEN")}
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #111827",
                                      background: "#fff",
                                      color: "#111827",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      opacity: createDisabled ? 0.7 : 1,
                                    }}
                                  >
                                    Create
                                  </button>
                                </div>
                              )}

                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                <div style={{ fontWeight: 950, color: "#111827" }}>Bar</div>
                                <div style={{ fontSize: 12, fontWeight: 900, color: statusColor(barTicket?.status || (hasDrink ? "NO" : "READY")) }}>
                                  {ticketLoading ? "Loading…" : !hasDrink ? "Not required" : barTicket ? barTicket.status : "No ticket"}
                                </div>
                              </div>
                              {!hasDrink ? null : barTicket ? (
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                  {barTicket.status === "NEW" ? (
                                    <button
                                      type="button"
                                      disabled={movingTicketId === barTicket.id}
                                      onClick={() => void moveTicketStatus(barTicket.id, "PREPARING", o)}
                                      style={{
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: "1px solid #111827",
                                        background: "#111827",
                                        color: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                        fontSize: 12,
                                        opacity: movingTicketId === barTicket.id ? 0.7 : 1,
                                      }}
                                    >
                                      Start
                                    </button>
                                  ) : null}
                                  {barTicket.status === "PREPARING" ? (
                                    <button
                                      type="button"
                                      disabled={movingTicketId === barTicket.id}
                                      onClick={() => void moveTicketStatus(barTicket.id, "READY", o)}
                                      style={{
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: "1px solid #111827",
                                        background: "#fff",
                                        color: "#111827",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                        fontSize: 12,
                                        opacity: movingTicketId === barTicket.id ? 0.7 : 1,
                                      }}
                                    >
                                      Ready
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    disabled={createDisabled}
                                    onClick={() => void createTicketForOrder(o, "BAR")}
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #111827",
                                      background: "#fff",
                                      color: "#111827",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      opacity: createDisabled ? 0.7 : 1,
                                    }}
                                  >
                                    Create
                                  </button>
                                </div>
                              )}

                              {stage.key !== "DONE" ? (
                                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    {hasFood && !kitchenReady ? "Kitchen not ready. " : ""}
                                    {hasDrink && !barReady ? "Bar not ready. " : ""}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void onConfirmParcel(o)}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 10,
                                      border: "1px solid #111827",
                                      background: confirmDone ? "#16a34a" : "#111827",
                                      color: "#fff",
                                      cursor: "pointer",
                                      fontWeight: 950,
                                      fontSize: 12,
                                    }}
                                  >
                                    {confirmDone ? "Confirmed" : "Confirm"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const DispatchWindow: React.FC = () => {
  return (
    <AdminWebSocketProvider>
      <DispatchWindowInner />
    </AdminWebSocketProvider>
  );
};

export default DispatchWindow;
