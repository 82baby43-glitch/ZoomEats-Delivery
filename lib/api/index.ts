import { supabase } from "../supabaseClient";
import { getCurrentUser } from "../auth";

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Edge Function fallback for routes needing service-role logic */
async function invokeEdgeApi(
  path: string,
  method: string,
  body?: unknown,
  params?: Record<string, string>
) {
  const token = await getAccessToken();
  const { data, error } = await supabase.functions.invoke("api", {
    body: { path, method, body, params },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (error) throw error;
  if (data?.error) {
    const err = new Error(data.error) as Error & { status?: number };
    err.status = data.status ?? 400;
    throw err;
  }
  return data;
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("Not authenticated") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return user;
}

function requireRole(user: { role: string }, ...roles: string[]) {
  if (!roles.includes(user.role)) {
    const err = new Error(`Requires role: ${roles.join(", ")}`) as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// ---- Route handlers (direct Supabase client) ----

async function handleGet(path: string, params: Record<string, string> = {}) {
  if (path === "/auth/me") return requireUser();

  if (path === "/restaurants") {
    let q = supabase.from("restaurants").select("*").eq("approved", true).order("rating", { ascending: false });
    if (params.q) {
      const s = `%${params.q}%`;
      q = q.or(`name.ilike.${s},description.ilike.${s},cuisine.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  const restMatch = path.match(/^\/restaurants\/([^/]+)$/);
  if (restMatch) {
    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("restaurant_id", restMatch[1])
      .maybeSingle();
    if (error) throw error;
    if (!restaurant) {
      const err = new Error("Not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    const { data: menu } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restMatch[1])
      .eq("available", true);
    return { restaurant, menu: menu ?? [] };
  }

  if (path === "/orders/my") {
    const user = await requireUser();
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_id", user.user_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  const trackingMatch = path.match(/^\/orders\/([^/]+)\/tracking$/);
  if (trackingMatch) {
    try {
      return await invokeEdgeApi(path, "GET");
    } catch {
      const user = await requireUser();
      const oid = trackingMatch[1];
      const { data: order, error } = await supabase.from("orders").select("*").eq("order_id", oid).maybeSingle();
      if (error) throw error;
      if (!order) {
        const err = new Error("Not found") as Error & { status?: number };
        err.status = 404;
        throw err;
      }
      const allowed =
        user.role === "admin" ||
        order.customer_id === user.user_id ||
        order.delivery_partner_id === user.user_id;
      if (!allowed) {
        const err = new Error("Forbidden") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
      return { order, delivery_type: order.delivery_type, tracking_id: order.tracking_id, driver: null, restaurant: null, customer: null, delivery: null };
    }
  }

  if (path === "/vendor/restaurant") {
    const user = await requireUser();
    requireRole(user, "vendor");
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", user.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  if (path === "/vendor/menu-items") {
    const user = await requireUser();
    requireRole(user, "vendor");
    const { data: rest } = await supabase
      .from("restaurants")
      .select("restaurant_id")
      .eq("owner_id", user.user_id)
      .limit(1)
      .maybeSingle();
    if (!rest) return [];
    const { data, error } = await supabase.from("menu_items").select("*").eq("restaurant_id", rest.restaurant_id);
    if (error) throw error;
    return data ?? [];
  }

  if (path === "/vendor/orders") {
    const user = await requireUser();
    requireRole(user, "vendor");
    const { data: rest } = await supabase
      .from("restaurants")
      .select("restaurant_id")
      .eq("owner_id", user.user_id)
      .limit(1)
      .maybeSingle();
    if (!rest) return [];
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", rest.restaurant_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  if (path === "/delivery/available") {
    await requireUser();
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "ready")
      .is("delivery_partner_id", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  if (path === "/delivery/my") {
    const user = await requireUser();
    requireRole(user, "delivery");
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("delivery_partner_id", user.user_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  if (path === "/driver/active") {
    const user = await requireUser();
    requireRole(user, "delivery");
    const { data: driver } = await supabase.from("drivers").select("*").eq("user_id", user.user_id).maybeSingle();
    if (!driver) return { driver: null, orders: [] };
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("driver_id", driver.driver_id)
      .in("status", ["assigned_internal", "picked_up"])
      .order("created_at", { ascending: false });
    return { driver, orders: orders ?? [] };
  }

  if (path === "/chat/history") {
    const user = await requireUser();
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", `chat_${user.user_id}`)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  }

  if (path === "/wallet/balance") {
    const user = await requireUser();
    const { data: w } = await supabase.from("wallets").select("*").eq("owner_user_id", user.user_id).maybeSingle();
    return { available: w?.available ?? 0, pending: w?.pending ?? 0 };
  }

  if (path === "/wallet/transactions") {
    const user = await requireUser();
    const { data: w } = await supabase.from("wallets").select("wallet_id").eq("owner_user_id", user.user_id).maybeSingle();
    if (!w) return [];
    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("wallet_id", w.wallet_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  }

  // Admin + checkout status + agreements → Edge Function
  if (
    path.startsWith("/admin") ||
    path.startsWith("/checkout/") ||
    path.startsWith("/agreements") ||
    path.startsWith("/uploads")
  ) {
    return invokeEdgeApi(path, "GET", undefined, params);
  }

  return invokeEdgeApi(path, "GET", undefined, params);
}

async function handlePost(path: string, body: Record<string, unknown> = {}) {
  if (path === "/auth/role") {
    const user = await requireUser();
    const role = body.role as string;
    if (!["customer", "vendor", "delivery"].includes(role)) throw new Error("Invalid role");
    if (user.role === "admin") throw new Error("Admin role cannot be changed");
    const { data, error } = await supabase.from("users").update({ role }).eq("user_id", user.user_id).select().single();
    if (error) throw error;
    return data;
  }

  if (path === "/orders") {
    return invokeEdgeApi(path, "POST", body);
  }

  if (path === "/checkout/session") {
    return invokeEdgeApi(path, "POST", body);
  }

  if (path === "/chat") {
    return invokeEdgeApi(path, "POST", body);
  }

  if (path === "/vendor/restaurant") {
    const user = await requireUser();
    requireRole(user, "vendor");
    const { data: existing } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", user.user_id)
      .limit(1)
      .maybeSingle();
    const restData = {
      name: body.name,
      description: body.description || "",
      cuisine: body.cuisine || "",
      image_url: body.image_url || "",
      cover_url: body.cover_url || "",
      address: body.address || "",
    };
    if (existing) {
      const { data, error } = await supabase
        .from("restaurants")
        .update(restData)
        .eq("restaurant_id", existing.restaurant_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const newRest = {
      restaurant_id: `rest_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
      owner_id: user.user_id,
      approved: false,
      rating: 4.6,
      delivery_time_min: 30,
      ...restData,
    };
    const { data, error } = await supabase.from("restaurants").insert(newRest).select().single();
    if (error) throw error;
    return data;
  }

  if (path === "/vendor/menu-items") {
    const user = await requireUser();
    requireRole(user, "vendor");
    const { data: rest } = await supabase
      .from("restaurants")
      .select("restaurant_id")
      .eq("owner_id", user.user_id)
      .limit(1)
      .maybeSingle();
    if (!rest) throw new Error("Create restaurant first");
    const item = {
      item_id: `item_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
      restaurant_id: rest.restaurant_id,
      name: body.name,
      description: body.description || "",
      price: body.price,
      image_url: body.image_url || "",
      category: body.category || "Mains",
      available: true,
    };
    const { data, error } = await supabase.from("menu_items").insert(item).select().single();
    if (error) throw error;
    return data;
  }

  const vendorStatusMatch = path.match(/^\/vendor\/orders\/([^/]+)\/status$/);
  if (vendorStatusMatch) {
    const user = await requireUser();
    requireRole(user, "vendor");
    const { data: rest } = await supabase
      .from("restaurants")
      .select("restaurant_id")
      .eq("owner_id", user.user_id)
      .limit(1)
      .maybeSingle();
    if (!rest) throw new Error("No restaurant");
    const { error } = await supabase
      .from("orders")
      .update({ status: body.status })
      .eq("order_id", vendorStatusMatch[1])
      .eq("restaurant_id", rest.restaurant_id);
    if (error) throw error;
    return { ok: true };
  }

  const deliveryMatch = path.match(/^\/delivery\/orders\/([^/]+)\/(accept|deliver)$/);
  if (deliveryMatch) {
    const user = await requireUser();
    requireRole(user, "delivery");
    const [, oid, action] = deliveryMatch;
    const { data: order } = await supabase.from("orders").select("*").eq("order_id", oid).maybeSingle();
    if (!order) throw new Error("Not found");
    if (action === "accept") {
      if (order.delivery_partner_id) throw new Error("Already taken");
      const { error } = await supabase
        .from("orders")
        .update({ delivery_partner_id: user.user_id, status: "picked_up" })
        .eq("order_id", oid);
      if (error) throw error;
    } else {
      if (order.delivery_partner_id !== user.user_id) throw new Error("Not your delivery");
      const { error } = await supabase.from("orders").update({ status: "delivered" }).eq("order_id", oid);
      if (error) throw error;
    }
    return { ok: true };
  }

  if (path === "/driver/location") {
    const user = await requireUser();
    requireRole(user, "delivery");
    const now = new Date().toISOString();
    const { data: existing } = await supabase.from("drivers").select("*").eq("user_id", user.user_id).maybeSingle();
    if (existing) {
      await supabase
        .from("drivers")
        .update({
          latitude: body.latitude,
          longitude: body.longitude,
          last_seen: now,
          availability: true,
        })
        .eq("driver_id", existing.driver_id);
      return { ok: true, driver_id: existing.driver_id, last_seen: now };
    }
    const driver = {
      driver_id: `drv_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
      user_id: user.user_id,
      latitude: body.latitude,
      longitude: body.longitude,
      availability: true,
      workload: 0,
      last_seen: now,
    };
    await supabase.from("drivers").insert(driver);
    return { ok: true, driver_id: driver.driver_id, last_seen: now };
  }

  if (path === "/driver/availability") {
    const user = await requireUser();
    requireRole(user, "delivery");
    const { data: d } = await supabase.from("drivers").select("*").eq("user_id", user.user_id).maybeSingle();
    if (!d) return { ok: true, available: body.available };
    await supabase
      .from("drivers")
      .update({ availability: !!body.available, last_seen: new Date().toISOString() })
      .eq("driver_id", d.driver_id);
    return { ok: true, available: body.available };
  }

  return invokeEdgeApi(path, "POST", body);
}

async function handleDelete(path: string) {
  const delMenuMatch = path.match(/^\/vendor\/menu-items\/([^/]+)$/);
  if (delMenuMatch) {
    const user = await requireUser();
    requireRole(user, "vendor");
    const { data: rest } = await supabase
      .from("restaurants")
      .select("restaurant_id")
      .eq("owner_id", user.user_id)
      .limit(1)
      .maybeSingle();
    if (!rest) throw new Error("No restaurant");
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("item_id", delMenuMatch[1])
      .eq("restaurant_id", rest.restaurant_id);
    if (error) throw error;
    return { ok: true };
  }
  return invokeEdgeApi(path, "DELETE");
}

async function request(path: string, method: string, body?: unknown, params?: Record<string, string>) {
  try {
    if (method === "GET") return await handleGet(path, params);
    if (method === "POST") return await handlePost(path, (body as Record<string, unknown>) ?? {});
    if (method === "DELETE") return await handleDelete(path);
    return await invokeEdgeApi(path, method, body, params);
  } catch (e: unknown) {
    const err = e as Error & { status?: number; context?: { status?: number } };
    // Edge Function not deployed → surface helpful message
    if (err.message?.includes("NOT_FOUND") || err.message?.includes("Requested function was not found")) {
      const wrapped = new Error(
        "Supabase Edge Function 'api' is not deployed. Run: supabase functions deploy api"
      ) as Error & { status?: number };
      wrapped.status = 503;
      throw wrapped;
    }
    throw err;
  }
}

export const api = {
  get: async (path: string, opts: { params?: Record<string, string> } = {}) => ({
    data: await request(path, "GET", undefined, opts.params),
  }),
  post: async (path: string, body: unknown = {}) => ({
    data: await request(path, "POST", body),
  }),
  put: async (path: string, body: unknown = {}) => ({
    data: await request(path, "PUT", body),
  }),
  delete: async (path: string) => ({
    data: await request(path, "DELETE"),
  }),
};

export const getWalletBalance = () => api.get("/wallet/balance");
export const getWalletTransactions = () => api.get("/wallet/transactions");
export const requestWalletPayout = (amount: number) => api.post("/wallet/payout", { amount });
