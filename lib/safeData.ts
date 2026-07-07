/** Universal safe wrapper — never pass raw API data into components. */

/** Null-safe access — returns fallback when obj is null/undefined. */
export function safeAccess<T>(obj: T | null | undefined, fallback: T): T {
  return obj ?? fallback;
}

/** Object-only safe access (rejects arrays / non-objects). */
export function safeAccessObject<T extends Record<string, unknown>>(obj: unknown, fallback: T = {} as T): T {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    return fallback;
  }
  return obj as T;
}

export function safeData<T>(data: unknown, fallback: T): T {
  if (data == null) return fallback;
  if (Array.isArray(fallback)) return (Array.isArray(data) ? data : fallback) as T;
  if (typeof fallback === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return fallback;
    return data as T;
  }
  return data as T;
}

export function safeArray<T = unknown>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function safeObject<T extends Record<string, unknown>>(data: unknown, defaults: T): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ...defaults };
  return { ...defaults, ...(data as T) };
}

export function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatMoney(value: unknown, fallback = "0.00"): string {
  const n = safeNumber(value, NaN);
  return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

export function safeOrderId(value: unknown): string {
  const id = safeString(value, "unknown");
  return id.length > 6 ? id.slice(-6) : id;
}

export type SafeOrderItem = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string;
};

export type SafeOrder = {
  order_id: string;
  customer_id: string;
  customer_name: string;
  restaurant_id: string;
  restaurant_name: string;
  items: SafeOrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  address: string;
  notes: string;
  status: string;
  payment_status: string;
  stripe_session_id: string;
  created_at: string;
};

const ORDER_DEFAULTS: SafeOrder = {
  order_id: "",
  customer_id: "",
  customer_name: "Unknown customer",
  restaurant_id: "",
  restaurant_name: "Unknown Restaurant",
  items: [],
  subtotal: 0,
  delivery_fee: 0,
  total: 0,
  address: "",
  notes: "",
  status: "pending_payment",
  payment_status: "pending",
  stripe_session_id: "",
  created_at: "",
};

export function sanitizeOrderItem(raw: unknown): SafeOrderItem {
  const item = safeObject(raw as Record<string, unknown>, {
    item_id: "",
    name: "Item",
    price: 0,
    quantity: 1,
    image_url: "",
  });
  return {
    item_id: safeString(item.item_id),
    name: safeString(item.name, "Item"),
    price: safeNumber(item.price),
    quantity: Math.max(1, safeNumber(item.quantity, 1)),
    image_url: safeString(item.image_url),
  };
}

export function sanitizeOrder(raw: unknown): SafeOrder {
  const o = safeObject(raw as Record<string, unknown>, ORDER_DEFAULTS);
  return {
    ...ORDER_DEFAULTS,
    order_id: safeString(o.order_id),
    customer_id: safeString(o.customer_id),
    customer_name: safeString(o.customer_name, "Unknown customer"),
    restaurant_id: safeString(o.restaurant_id),
    restaurant_name: safeString(o.restaurant_name, "Unknown Restaurant"),
    items: safeArray(o.items).map(sanitizeOrderItem),
    subtotal: safeNumber(o.subtotal),
    delivery_fee: safeNumber(o.delivery_fee),
    total: safeNumber(o.total),
    address: safeString(o.address),
    notes: safeString(o.notes),
    status: safeString(o.status, "pending_payment"),
    payment_status: safeString(o.payment_status, "pending"),
    stripe_session_id: safeString(o.stripe_session_id),
    created_at: safeString(o.created_at),
  };
}

export function sanitizeOrders(raw: unknown): SafeOrder[] {
  return safeArray(raw).map(sanitizeOrder).filter((o) => o.order_id);
}

export type SafeRestaurant = {
  restaurant_id: string;
  name: string;
  cuisine: string;
  address: string;
  image_url: string;
  approved: boolean;
  import_source?: string;
};

export function sanitizeRestaurant(raw: unknown): SafeRestaurant {
  const r = safeObject(raw as Record<string, unknown>, {
    restaurant_id: "",
    name: "Unknown Restaurant",
    cuisine: "",
    address: "",
    image_url: "",
    approved: false,
    import_source: "",
  });
  return {
    restaurant_id: safeString(r.restaurant_id),
    name: safeString(r.name, "Unknown Restaurant"),
    cuisine: safeString(r.cuisine),
    address: safeString(r.address),
    image_url: safeString(r.image_url),
    approved: Boolean(r.approved),
    import_source: safeString(r.import_source) || undefined,
  };
}

export function sanitizeRestaurants(raw: unknown): SafeRestaurant[] {
  return safeArray(raw).map(sanitizeRestaurant);
}

export type SafeUser = {
  user_id: string;
  name: string;
  email: string;
  role: string;
};

export function sanitizeUser(raw: unknown): SafeUser {
  const u = safeObject(raw as Record<string, unknown>, {
    user_id: "",
    name: "Unknown",
    email: "",
    role: "customer",
  });
  return {
    user_id: safeString(u.user_id),
    name: safeString(u.name, "Unknown"),
    email: safeString(u.email),
    role: safeString(u.role, "customer"),
  };
}

export function sanitizeUsers(raw: unknown): SafeUser[] {
  return safeArray(raw).map(sanitizeUser);
}

export type SafeAttention = {
  pending_restaurants: SafeRestaurant[];
  stuck_orders: SafeOrder[];
  failed_payments: Array<{ session_id: string; amount: number; user_id: string; payment_status: string; created_at: string }>;
  counts: { pending: number; stuck: number; failed: number };
};

const EMPTY_ATTENTION: SafeAttention = {
  pending_restaurants: [],
  stuck_orders: [],
  failed_payments: [],
  counts: { pending: 0, stuck: 0, failed: 0 },
};

export function sanitizeAttention(raw: unknown): SafeAttention {
  const a = safeObject(raw as Record<string, unknown>, EMPTY_ATTENTION as unknown as Record<string, unknown>);
  const counts = safeObject(a.counts as Record<string, unknown>, { pending: 0, stuck: 0, failed: 0 });
  return {
    pending_restaurants: sanitizeRestaurants(a.pending_restaurants),
    stuck_orders: sanitizeOrders(a.stuck_orders),
    failed_payments: safeArray(a.failed_payments).map((p) => {
      const row = safeObject(p as Record<string, unknown>, {
        session_id: "",
        amount: 0,
        user_id: "",
        payment_status: "unknown",
        created_at: "",
      });
      return {
        session_id: safeString(row.session_id),
        amount: safeNumber(row.amount),
        user_id: safeString(row.user_id),
        payment_status: safeString(row.payment_status, "unknown"),
        created_at: safeString(row.created_at),
      };
    }),
    counts: {
      pending: safeNumber(counts.pending),
      stuck: safeNumber(counts.stuck),
      failed: safeNumber(counts.failed),
    },
  };
}

export type SafeMetrics = {
  users: number;
  restaurants: number;
  orders: number;
  paid_orders: number;
  revenue: number;
};

export function sanitizeMetrics(raw: unknown): SafeMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    users: safeNumber(m.users),
    restaurants: safeNumber(m.restaurants),
    orders: safeNumber(m.orders),
    paid_orders: safeNumber(m.paid_orders),
    revenue: safeNumber(m.revenue),
  };
}

export type SafeActivityEvent = {
  type: string;
  title: string;
  description: string;
  when: string;
  id: string;
};

export function sanitizeActivity(raw: unknown): SafeActivityEvent[] {
  return safeArray(raw).map((e) => {
    const row = safeObject(e as Record<string, unknown>, {
      type: "order",
      title: "Event",
      description: "",
      when: "",
      id: "",
    });
    return {
      type: safeString(row.type, "order"),
      title: safeString(row.title, "Event"),
      description: safeString(row.description),
      when: safeString(row.when),
      id: safeString(row.id, crypto.randomUUID?.() ?? String(Date.now())),
    };
  });
}

export function sanitizeWallet(raw: unknown): { available: number; pending: number } {
  const w = safeObject(raw as Record<string, unknown>, { available: 0, pending: 0 });
  return { available: safeNumber(w.available), pending: safeNumber(w.pending) };
}

export function sanitizeActiveDispatch(raw: unknown): { driver: unknown; orders: SafeOrder[] } {
  const d = safeObject(raw as Record<string, unknown>, { driver: null, orders: [] });
  return {
    driver: d.driver ?? null,
    orders: sanitizeOrders(d.orders),
  };
}
