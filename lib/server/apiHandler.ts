// ZoomEats API — Supabase Edge Function (replaces FastAPI backend)
import type { SupabaseClient } from "@supabase/supabase-js";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function computePriceHash(items: Array<{ item_id: string; name: string; price: number; quantity: number }>) {
  const snapshot = [...items]
    .sort((a, b) => a.item_id.localeCompare(b.item_id))
    .map((it) => ({
      item_id: it.item_id,
      name: it.name,
      price: Number(it.price),
      quantity: Number(it.quantity),
    }));
  const blob = JSON.stringify(snapshot);
  // Simple hash for edge runtime
  let h = 0;
  for (let i = 0; i < blob.length; i++) h = ((h << 5) - h + blob.charCodeAt(i)) | 0;
  return `h${Math.abs(h).toString(16)}`;
}

export async function handleApiRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    userToken?: string;
  }
) {
  const stripeKey = process.env.STRIPE_API_KEY || "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  const adminEmails = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

  const path = opts.path || "/";
  const method = (opts.method || "GET").toUpperCase();
  const body = opts.body || {};
  const params = opts.params || {};
  const token = opts.userToken || "";
  let user: Record<string, unknown> | null = null;

  if (token) {
    const { data: { user: authUser } } = await db.auth.getUser(token);
    if (authUser) {
      const { data: profile } = await db.from("users").select("*").eq("user_id", authUser.id).maybeSingle();
      if (profile) {
        user = profile;
      } else {
        const email = authUser.email || "";
        const role = adminEmails.includes(email.toLowerCase()) ? "admin" : "customer";
        const newProfile = {
          user_id: authUser.id,
          email,
          name: authUser.user_metadata?.full_name || email.split("@")[0],
          picture: authUser.user_metadata?.avatar_url || "",
          role,
        };
        await db.from("users").upsert(newProfile);
        user = newProfile;
      }
    }
  }

  const requireAuth = () => {
    if (!user) throw { status: 401, message: "Not authenticated" };
    return user;
  };
  const requireRole = (...roles: string[]) => {
    const u = requireAuth();
    if (!roles.includes(u.role as string)) throw { status: 403, message: `Requires role: ${roles}` };
    return u;
  };

  try {
    // ---- Auth ----
    if (path === "/auth/me" && method === "GET") {
      const u = requireAuth();
      return u;
    }
    if (path === "/auth/role" && method === "POST") {
      const u = requireAuth();
      const role = body.role as string;
      if (!["customer", "vendor", "delivery"].includes(role)) throwErr("Invalid role");
      if (u.role === "admin") throwErr("Admin role cannot be changed");
      const { data } = await db.from("users").update({ role }).eq("user_id", u.user_id).select().single();
      return data;
    }

    // ---- Restaurants (public) ----
    if (path === "/restaurants" && method === "GET") {
      let q = db.from("restaurants").select("*").eq("approved", true).order("rating", { ascending: false });
      const search = params.q;
      if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,cuisine.ilike.%${search}%`);
      const { data } = await q;
      return data || [];
    }

    const restMatch = path.match(/^\/restaurants\/([^/]+)$/);
    if (restMatch && method === "GET") {
      const rid = restMatch[1];
      const { data: restaurant } = await db.from("restaurants").select("*").eq("restaurant_id", rid).maybeSingle();
      if (!restaurant) throwErr("Not found", 404);
      const { data: menu } = await db.from("menu_items").select("*").eq("restaurant_id", rid).eq("available", true);
      return { restaurant, menu: menu || [] };
    }

    // ---- Vendor ----
    if (path === "/vendor/restaurant" && method === "GET") {
      const u = requireRole("vendor");
      const { data } = await db.from("restaurants").select("*").eq("owner_id", u.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    }
    if (path === "/vendor/restaurant" && method === "POST") {
      const u = requireRole("vendor");
      const { data: existing } = await db.from("restaurants").select("*").eq("owner_id", u.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const restData = {
        name: body.name,
        description: body.description || "",
        cuisine: body.cuisine || "",
        image_url: body.image_url || "",
        cover_url: body.cover_url || "",
        address: body.address || "",
      };
      if (existing) {
        const { data } = await db.from("restaurants").update(restData).eq("restaurant_id", existing.restaurant_id).select().single();
        return data;
      }
      const newRest = {
        restaurant_id: uid("rest"),
        owner_id: u.user_id,
        approved: false,
        rating: 4.6,
        delivery_time_min: 30,
        ...restData,
      };
      const { data } = await db.from("restaurants").insert(newRest).select().single();
      return data;
    }
    if (path === "/vendor/menu-items" && method === "GET") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) return [];
      const { data } = await db.from("menu_items").select("*").eq("restaurant_id", rest.restaurant_id);
      return data || [];
    }
    if (path === "/vendor/menu-items" && method === "POST") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) throwErr("Create restaurant first");
      const item = {
        item_id: uid("item"),
        restaurant_id: rest.restaurant_id,
        name: body.name,
        description: body.description || "",
        price: body.price,
        image_url: body.image_url || "",
        category: body.category || "Mains",
        available: true,
      };
      const { data } = await db.from("menu_items").insert(item).select().single();
      return data;
    }
    const delMenuMatch = path.match(/^\/vendor\/menu-items\/([^/]+)$/);
    if (delMenuMatch && method === "DELETE") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) throwErr("No restaurant", 404);
      await db.from("menu_items").delete().eq("item_id", delMenuMatch[1]).eq("restaurant_id", rest.restaurant_id);
      return { ok: true };
    }
    if (path === "/vendor/orders" && method === "GET") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) return [];
      const { data } = await db.from("orders").select("*").eq("restaurant_id", rest.restaurant_id).order("created_at", { ascending: false });
      return data || [];
    }
    const vendorStatusMatch = path.match(/^\/vendor\/orders\/([^/]+)\/status$/);
    if (vendorStatusMatch && method === "POST") {
      const u = requireRole("vendor");
      const newStatus = body.status as string;
      if (!["accepted", "preparing", "ready"].includes(newStatus)) throwErr("Invalid status");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) throwErr("No restaurant", 404);
      await db.from("orders").update({ status: newStatus }).eq("order_id", vendorStatusMatch[1]).eq("restaurant_id", rest.restaurant_id);
      return { ok: true };
    }

    // ---- Orders ----
    if (path === "/orders" && method === "POST") {
      const u = requireAuth();
      const items = (body.items as Array<{ item_id: string; quantity: number }>) || [];
      const restaurant_id = body.restaurant_id as string;
      if (!items.length) throwErr("Empty cart");
      const { data: rest } = await db.from("restaurants").select("*").eq("restaurant_id", restaurant_id).maybeSingle();
      if (!rest) throwErr("Restaurant not found", 404);
      const ids = items.map((i) => i.item_id);
      const { data: menuRows } = await db.from("menu_items").select("*").in("item_id", ids).eq("restaurant_id", restaurant_id).eq("available", true);
      const canonical = Object.fromEntries((menuRows || []).map((m) => [m.item_id, m]));
      const missing = ids.filter((id) => !canonical[id]);
      if (missing.length) throwErr(`Unavailable item(s): ${missing.join(", ")}`);
      const repriced = items.map((line) => {
        const m = canonical[line.item_id];
        const qty = Math.max(1, Math.min(Number(line.quantity), 99));
        return { item_id: m.item_id, name: m.name, price: m.price, quantity: qty, image_url: m.image_url || "" };
      });
      const subtotal = Math.round(repriced.reduce((s, it) => s + it.price * it.quantity, 0) * 100) / 100;
      const delivery_fee = 2.99;
      const total = Math.round((subtotal + delivery_fee) * 100) / 100;
      const order = {
        order_id: uid("ord"),
        customer_id: u.user_id,
        customer_name: u.name,
        restaurant_id: rest.restaurant_id,
        restaurant_name: rest.name,
        items: repriced,
        subtotal,
        delivery_fee,
        total,
        address: body.address || "",
        notes: body.notes || "",
        status: "pending_payment",
        payment_status: "pending",
        price_hash: computePriceHash(repriced),
      };
      const { data } = await db.from("orders").insert(order).select().single();
      return data;
    }
    if (path === "/orders/my" && method === "GET") {
      const u = requireAuth();
      const { data } = await db.from("orders").select("*").eq("customer_id", u.user_id).order("created_at", { ascending: false });
      return data || [];
    }

    const trackingMatch = path.match(/^\/orders\/([^/]+)\/tracking$/);
    if (trackingMatch && method === "GET") {
      const u = requireAuth();
      const oid = trackingMatch[1];
      const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
      if (!o) throwErr("Not found", 404);
      let allowed = u.role === "admin" || o.customer_id === u.user_id || o.delivery_partner_id === u.user_id;
      if (!allowed && o.restaurant_id) {
        const { data: rest } = await db.from("restaurants").select("owner_id").eq("restaurant_id", o.restaurant_id).maybeSingle();
        if (rest?.owner_id === u.user_id) allowed = true;
      }
      if (!allowed) throwErr("Forbidden", 403);
      let driver = null;
      if (o.driver_id) {
        const { data: drv } = await db.from("drivers").select("*").eq("driver_id", o.driver_id).maybeSingle();
        if (drv) driver = { driver_id: drv.driver_id, latitude: drv.latitude, longitude: drv.longitude, last_seen: drv.last_seen };
      }
      let restaurant = null;
      if (o.restaurant_id) {
        const { data: rest } = await db.from("restaurants").select("name,latitude,longitude,address").eq("restaurant_id", o.restaurant_id).maybeSingle();
        restaurant = rest;
      }
      const { data: delivery } = await db.from("deliveries").select("*").eq("order_id", oid).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return {
        order: o,
        delivery_type: o.delivery_type,
        tracking_id: o.tracking_id,
        driver,
        restaurant,
        customer: o.customer_lat ? { latitude: o.customer_lat, longitude: o.customer_lng, address: o.address } : null,
        delivery,
      };
    }

    // ---- Delivery ----
    if (path === "/delivery/available" && method === "GET") {
      requireRole("delivery");
      const { data } = await db.from("orders").select("*").eq("status", "ready").is("delivery_partner_id", null).order("created_at", { ascending: false });
      return data || [];
    }
    if (path === "/delivery/my" && method === "GET") {
      const u = requireRole("delivery");
      const { data } = await db.from("orders").select("*").eq("delivery_partner_id", u.user_id).order("created_at", { ascending: false });
      return data || [];
    }
    const deliveryActionMatch = path.match(/^\/delivery\/orders\/([^/]+)\/(accept|deliver)$/);
    if (deliveryActionMatch && method === "POST") {
      const u = requireRole("delivery");
      const [, oid, action] = deliveryActionMatch;
      const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
      if (!o) throwErr("Not found", 404);
      if (action === "accept") {
        if (o.delivery_partner_id) throwErr("Already taken");
        await db.from("orders").update({ delivery_partner_id: u.user_id, status: "picked_up" }).eq("order_id", oid);
      } else {
        if (o.delivery_partner_id !== u.user_id) throwErr("Not your delivery", 403);
        await db.from("orders").update({ status: "delivered" }).eq("order_id", oid);
      }
      return { ok: true };
    }

    // ---- Driver ----
    if (path === "/driver/location" && method === "POST") {
      const u = requireRole("delivery");
      const { data: existing } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      const now = new Date().toISOString();
      if (existing) {
        await db.from("drivers").update({
          latitude: body.latitude,
          longitude: body.longitude,
          last_seen: now,
          availability: true,
        }).eq("driver_id", existing.driver_id);
        return { ok: true, driver_id: existing.driver_id, last_seen: now };
      }
      const driver = { driver_id: uid("drv"), user_id: u.user_id, latitude: body.latitude, longitude: body.longitude, availability: true, workload: 0, last_seen: now };
      await db.from("drivers").insert(driver);
      return { ok: true, driver_id: driver.driver_id, last_seen: now };
    }
    if (path === "/driver/availability" && method === "POST") {
      const u = requireRole("delivery");
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) return { ok: true, available: body.available };
      await db.from("drivers").update({ availability: !!body.available, last_seen: new Date().toISOString() }).eq("driver_id", d.driver_id);
      return { ok: true, available: body.available };
    }
    if (path === "/driver/active" && method === "GET") {
      const u = requireRole("delivery");
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) return { driver: null, orders: [] };
      const { data: orders } = await db.from("orders").select("*").eq("driver_id", d.driver_id).in("status", ["assigned_internal", "picked_up"]).order("created_at", { ascending: false });
      return { driver: d, orders: orders || [] };
    }

    // ---- Checkout ----
    if (path === "/checkout/session" && method === "POST") {
      const u = requireAuth();
      const order_id = body.order_id as string;
      const origin_url = body.origin_url as string;
      if (!order_id || !origin_url) throwErr("order_id & origin_url required");
      const { data: o } = await db.from("orders").select("*").eq("order_id", order_id).eq("customer_id", u.user_id).maybeSingle();
      if (!o) throwErr("Order not found", 404);
      if (o.payment_status === "paid") throwErr("Already paid");

      if (!stripeKey) {
        // Soft-pending mode without Stripe
        const session_id = uid("cs_test");
        await db.from("payment_transactions").insert({
          session_id,
          order_id,
          user_id: u.user_id,
          amount: o.total,
          currency: "usd",
          payment_status: "initiated",
        });
        await db.from("orders").update({ stripe_session_id: session_id }).eq("order_id", order_id);
        return { url: `${origin_url}/checkout/success?session_id=${session_id}`, session_id };
      }

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          mode: "payment",
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][product_data][name]": `ZoomEats Order ${order_id}`,
          "line_items[0][price_data][unit_amount]": String(Math.round(o.total * 100)),
          "line_items[0][quantity]": "1",
          success_url: `${origin_url}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin_url}/cart`,
          "metadata[order_id]": order_id,
          "metadata[user_id]": u.user_id as string,
        }),
      });
      const session = await stripeRes.json();
      if (!stripeRes.ok) throwErr(session.error?.message || "Stripe error", 500);
      await db.from("payment_transactions").insert({
        session_id: session.id,
        order_id,
        user_id: u.user_id,
        amount: o.total,
        currency: "usd",
        payment_status: "initiated",
      });
      await db.from("orders").update({ stripe_session_id: session.id }).eq("order_id", order_id);
      return { url: session.url, session_id: session.id };
    }

    const checkoutStatusMatch = path.match(/^\/checkout\/status\/([^/]+)$/);
    if (checkoutStatusMatch && method === "GET") {
      requireAuth();
      const session_id = checkoutStatusMatch[1];
      const { data: tx } = await db.from("payment_transactions").select("*").eq("session_id", session_id).maybeSingle();

      if (!stripeKey) {
        // Auto-mark paid in test mode
        if (tx && tx.payment_status !== "paid") {
          await db.from("payment_transactions").update({ payment_status: "paid" }).eq("session_id", session_id);
          if (tx.order_id) {
            await db.from("orders").update({ payment_status: "paid", status: "placed" }).eq("order_id", tx.order_id);
          }
        }
        return { status: "complete", payment_status: "paid", amount_total: Math.round((tx?.amount || 0) * 100), currency: "usd" };
      }

      try {
        const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        const status = await r.json();
        if (tx && tx.payment_status !== "paid" && status.payment_status === "paid") {
          await db.from("payment_transactions").update({ payment_status: "paid", status: status.status }).eq("session_id", session_id);
          if (tx.order_id) {
            await db.from("orders").update({ payment_status: "paid", status: "placed" }).eq("order_id", tx.order_id);
          }
        }
        return { status: status.status, payment_status: status.payment_status, amount_total: status.amount_total, currency: status.currency };
      } catch {
        return { status: "open", payment_status: tx?.payment_status || "pending", amount_total: Math.round((tx?.amount || 0) * 100), currency: "usd", soft_error: true };
      }
    }

    // ---- Chat ----
    if (path === "/chat" && method === "POST") {
      const u = requireAuth();
      const text = body.text as string;
      const session_id = (body.session_id as string) || `chat_${u.user_id}`;
      const { data: rests } = await db.from("restaurants").select("name,cuisine").eq("approved", true).limit(15);
      const { data: items } = await db.from("menu_items").select("name,price").eq("available", true).limit(30);
      const context = `Available restaurants: ${(rests || []).map((r) => `${r.name} (${r.cuisine || ""})`).join(", ")}\nPopular items: ${(items || []).slice(0, 15).map((i) => `${i.name} ($${i.price})`).join(", ")}`;

      let reply = "I'd love to help you find something delicious! Try browsing our featured restaurants on the home page.";
      if (anthropicKey) {
        try {
          const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 300,
              system: `You are Zoey, the friendly food concierge for ZoomEats. Help users pick restaurants. Keep replies short (2-4 sentences). Use only this context:\n${context}`,
              messages: [{ role: "user", content: text }],
            }),
          });
          const aiData = await aiRes.json();
          reply = aiData.content?.[0]?.text || reply;
        } catch (e) {
          console.error("LLM error:", e);
        }
      }

      await db.from("chat_messages").insert([
        { session_id, user_id: u.user_id, role: "user", text },
        { session_id, user_id: u.user_id, role: "assistant", text: reply },
      ]);
      return { reply, session_id };
    }
    if (path === "/chat/history" && method === "GET") {
      const u = requireAuth();
      const session_id = `chat_${u.user_id}`;
      const { data } = await db.from("chat_messages").select("*").eq("session_id", session_id).order("created_at", { ascending: true }).limit(200);
      return data || [];
    }

    // ---- Wallet ----
    if (path === "/wallet/balance" && method === "GET") {
      const u = requireAuth();
      const { data: w } = await db.from("wallets").select("*").eq("owner_user_id", u.user_id).maybeSingle();
      return { available: w?.available || 0, pending: w?.pending || 0 };
    }
    if (path === "/wallet/transactions" && method === "GET") {
      const u = requireAuth();
      const { data: w } = await db.from("wallets").select("wallet_id").eq("owner_user_id", u.user_id).maybeSingle();
      if (!w) return [];
      const { data } = await db.from("wallet_transactions").select("*").eq("wallet_id", w.wallet_id).order("created_at", { ascending: false }).limit(200);
      return data || [];
    }
    if (path === "/wallet/payout" && method === "POST") {
      requireAuth();
      return { payout_id: uid("po"), status: "initiated" };
    }

    // ---- Admin ----
    if (path === "/admin/metrics" && method === "GET") {
      requireRole("admin");
      const [{ count: users }, { count: restaurants }, { count: orders }] = await Promise.all([
        db.from("users").select("*", { count: "exact", head: true }),
        db.from("restaurants").select("*", { count: "exact", head: true }),
        db.from("orders").select("*", { count: "exact", head: true }),
      ]);
      const { data: paidOrders } = await db.from("orders").select("total").eq("payment_status", "paid");
      const revenue = (paidOrders || []).reduce((s, o) => s + (o.total || 0), 0);
      return { users: users || 0, restaurants: restaurants || 0, orders: orders || 0, paid_orders: paidOrders?.length || 0, revenue: Math.round(revenue * 100) / 100 };
    }
    if (path === "/admin/users" && method === "GET") {
      requireRole("admin");
      const { data } = await db.from("users").select("*").order("created_at", { ascending: false });
      return data || [];
    }
    if (path === "/admin/restaurants" && method === "GET") {
      requireRole("admin");
      const { data } = await db.from("restaurants").select("*").order("created_at", { ascending: false });
      return data || [];
    }
    const approveMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/approve$/);
    if (approveMatch && method === "POST") {
      requireRole("admin");
      await db.from("restaurants").update({ approved: true }).eq("restaurant_id", approveMatch[1]);
      return { ok: true };
    }
    if (path === "/admin/orders" && method === "GET") {
      requireRole("admin");
      const { data } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
      return data || [];
    }
    if (path === "/admin/activity" && method === "GET") {
      requireRole("admin");
      const [{ data: orders }, { data: users }, { data: rests }] = await Promise.all([
        db.from("orders").select("*").order("created_at", { ascending: false }).limit(30),
        db.from("users").select("*").order("created_at", { ascending: false }).limit(15),
        db.from("restaurants").select("*").order("created_at", { ascending: false }).limit(15),
      ]);
      const events = [
        ...(orders || []).map((o) => ({ type: "order", title: `Order $${o.total?.toFixed(2)} · ${o.restaurant_name}`, description: `${o.customer_name} · ${o.status} · ${o.payment_status}`, when: o.created_at, id: o.order_id })),
        ...(users || []).map((u) => ({ type: "signup", title: `New ${u.role}: ${u.name}`, description: u.email, when: u.created_at, id: u.user_id })),
        ...(rests || []).map((r) => ({ type: "restaurant", title: `Restaurant: ${r.name}`, description: `${r.cuisine || ""} · ${r.approved ? "approved" : "pending"}`, when: r.created_at, id: r.restaurant_id })),
      ].sort((a, b) => (b.when || "").localeCompare(a.when || "")).slice(0, 30);
      return events;
    }
    if (path === "/admin/attention" && method === "GET") {
      requireRole("admin");
      const { data: pending } = await db.from("restaurants").select("*").eq("approved", false);
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: stuck } = await db.from("orders").select("*").eq("payment_status", "paid").in("status", ["placed", "accepted", "preparing", "ready", "picked_up"]).lt("created_at", cutoff);
      const { data: failed } = await db.from("payment_transactions").select("*").not("payment_status", "in", "(paid,initiated)").order("created_at", { ascending: false });
      return {
        pending_restaurants: pending || [],
        stuck_orders: stuck || [],
        failed_payments: failed || [],
        counts: { pending: pending?.length || 0, stuck: stuck?.length || 0, failed: failed?.length || 0 },
      };
    }
    if (path === "/admin/digest" && method === "GET") {
      requireRole("admin");
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayStart = today.toISOString();
      const { data: todaysOrders } = await db.from("orders").select("*").gte("created_at", todayStart);
      const paid = (todaysOrders || []).filter((o) => o.payment_status === "paid");
      const gmv = paid.reduce((s, o) => s + (o.total || 0), 0);
      const { count: pending } = await db.from("restaurants").select("*", { count: "exact", head: true }).eq("approved", false);
      return {
        digest: `Today's pulse: ${todaysOrders?.length || 0} orders, $${gmv.toFixed(2)} GMV. ${pending || 0} restaurant(s) awaiting approval.`,
        stats: { orders: todaysOrders?.length || 0, paid_orders: paid.length, gmv: Math.round(gmv * 100) / 100, pending_approvals: pending || 0 },
      };
    }
    if (path.startsWith("/admin/compliance") || path.startsWith("/agreements")) {
      return { ok: true, items: [], reviews: [] };
    }
    if (path.startsWith("/uploads")) {
      return { url: "", key: "uploads/placeholder" };
    }

    if (path === "/" && method === "GET") {
      return { app: "ZoomEats", db: "supabase", status: "ok" };
    }

    throwErr(`Unknown route: ${method} ${path}`, 404);
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const message = (e as { message?: string }).message || "Internal error";
    throwErr(message, status);
  }
}
