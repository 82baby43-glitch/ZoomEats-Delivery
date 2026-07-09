// ZoomEats API — Supabase Edge Function (replaces FastAPI backend)
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOG_EVENTS,
  alreadyProcessedSession,
  fetchWithRateLimitRetry,
  structuredLog,
} from "./stripeIdempotency";
import { getStripeApiKey } from "./stripeEnv";
import { createRoutingDbAdapter } from "../dispatch/routing/db-adapter";
import { getRoutingMetrics } from "../dispatch/routing/metrics";
import {
  processGpsAndMaybeReroute,
  recalculateOptimalRoute,
  tryInsertOrderIntoRoute,
} from "../dispatch/routing/uber-routing-ai";
import { handleComplianceRequest } from "./complianceHandler";
import { handleDreamlandRequest } from "./dreamlandHandler";
import { handleFounderDriverRequest } from "../founderDriver/handler";
import { canUseDriverApis } from "../founderDriver/auth";
import { handleLogisticsRequest } from "./logisticsHandler";
import { handleUberDirectAdminRequest } from "./uberDirectAdmin";
import { handleStripeAdminRequest } from "./stripeAdmin";
import { handleGeocodeAdminRequest } from "./geocodeAdmin";
import { geocodeOrderAddress } from "./geocodeAdmin";
import { normalizeRole } from "../compliance/authz";
import { isTestRestaurantName } from "../restaurants";
import { finalizePublicRestaurantList } from "./restaurantListing";
import {
  getImportProgress,
  hasGooglePlacesApiKey,
  newImportId,
  parseImportProvider,
  runGooglePlacesImport,
  sanitizeImportString,
} from "./googlePlacesImport";
import { runOpenStreetMapImport } from "./openStreetMapImport";

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
  const stripeKey = getStripeApiKey();
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
    const userRole = normalizeRole(String(u.role || ""));
    const expanded = roles.flatMap((r) => [r, normalizeRole(r)]);
    if (!expanded.includes(userRole) && !expanded.includes(u.role as string)) {
      throw { status: 403, message: `Requires role: ${roles.join(", ")}` };
    }
    return u;
  };

  const requireDriverOrFounder = () => {
    const u = requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throw { status: 403, message: "Requires delivery role or Founder Driver permission" };
    }
    return u;
  };

  const complianceCtx = {
    path,
    method,
    body,
    params,
    user,
    requireAuth,
    requireRole,
  };

  try {
    const complianceResult = await handleComplianceRequest(db, complianceCtx);
    if (complianceResult !== null) return complianceResult;

    const uberDirectResult = await handleUberDirectAdminRequest(db, complianceCtx);
    if (uberDirectResult !== null) return uberDirectResult;

    const stripeResult = await handleStripeAdminRequest(db, complianceCtx);
    if (stripeResult !== null) return stripeResult;

    const geocodeResult = await handleGeocodeAdminRequest(db, complianceCtx);
    if (geocodeResult !== null) return geocodeResult;

    const dreamlandResult = await handleDreamlandRequest(db, {
      path,
      method,
      body,
      params,
      anthropicKey,
      requireAuth,
    });
    if (dreamlandResult !== null) return dreamlandResult;

    const founderResult = await handleFounderDriverRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
    });
    if (founderResult !== null) return founderResult;

    const logisticsResult = await handleLogisticsRequest(db, {
      path,
      method,
      body,
      requireAuth,
      requireRole,
    });
    if (logisticsResult !== null) return logisticsResult;

    // ---- Auth ----
    if (path === "/auth/me" && method === "GET") {
      const u = requireAuth();
      return u;
    }

    // ---- Restaurants (public) ----
    if (path === "/restaurants" && method === "GET") {
      let q = db
        .from("restaurants")
        .select("*")
        .eq("approved", true)
        .eq("active", true)
        .not("name", "ilike", "TEST_%")
        .order("rating", { ascending: false });
      const search = sanitizeImportString(params.q, 120);
      const cuisine = sanitizeImportString(params.cuisine, 80);
      const category = sanitizeImportString(params.category, 80);
      if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,cuisine.ilike.%${search}%`);
      if (cuisine) q = q.ilike("cuisine", `%${cuisine}%`);
      if (category) q = q.ilike("primary_category", `%${category}%`);
      const { data } = await q;
      return finalizePublicRestaurantList(data || [], params);
    }

    const restMatch = path.match(/^\/restaurants\/([^/]+)$/);
    if (restMatch && method === "GET") {
      const rid = restMatch[1];
      const { data: restaurant } = await db.from("restaurants").select("*").eq("restaurant_id", rid).maybeSingle();
      if (!restaurant || isTestRestaurantName(restaurant.name)) throwErr("Not found", 404);
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
      const deliveryAddress = String(body.address || "").trim();
      const geo = deliveryAddress ? await geocodeOrderAddress(deliveryAddress, u.name as string) : null;
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
        address: deliveryAddress,
        customer_lat: geo?.latitude ?? null,
        customer_lng: geo?.longitude ?? null,
        notes: body.notes || "",
        status: "pending_payment",
        payment_status: "pending",
        price_hash: computePriceHash(repriced),
        created_at: new Date().toISOString(),
      };
      const { data, error: insertError } = await db.from("orders").insert(order).select().single();
      if (insertError) throwErr(insertError.message, 500);
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

    // ---- Driver (founder admins with founder_driver may also use these endpoints) ----
    if (path === "/driver/location" && method === "POST") {
      const u = requireDriverOrFounder();
      const { data: existing } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      const now = new Date().toISOString();
      if (existing) {
        await db.from("drivers").update({
          latitude: body.latitude,
          longitude: body.longitude,
          last_seen: now,
          availability: true,
        }).eq("driver_id", existing.driver_id);

        // Routing intelligence layer — GPS stream ingestion
        try {
          const routingDb = createRoutingDbAdapter(db);
          await processGpsAndMaybeReroute(routingDb, {
            driver_id: existing.driver_id,
            lat: body.latitude as number,
            lng: body.longitude as number,
            timestamp: now,
          });
        } catch (e) {
          console.warn(JSON.stringify({ routing_gps_skipped: String(e) }));
        }

        return { ok: true, driver_id: existing.driver_id, last_seen: now };
      }
      const driver = { driver_id: uid("drv"), user_id: u.user_id, latitude: body.latitude, longitude: body.longitude, availability: true, workload: 0, last_seen: now };
      await db.from("drivers").insert(driver);
      return { ok: true, driver_id: driver.driver_id, last_seen: now };
    }
    if (path === "/driver/availability" && method === "POST") {
      const u = requireDriverOrFounder();
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) return { ok: true, available: body.available };
      await db.from("drivers").update({ availability: !!body.available, last_seen: new Date().toISOString() }).eq("driver_id", d.driver_id);
      return { ok: true, available: body.available };
    }
    if (path === "/driver/active" && method === "GET") {
      const u = requireDriverOrFounder();
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) return { driver: null, orders: [], route: null };
      const { data: orders } = await db.from("orders").select("*").eq("driver_id", d.driver_id).in("status", ["assigned_internal", "picked_up"]).order("created_at", { ascending: false });
      const { data: routeState } = await db.from("driver_route_states").select("*").eq("driver_id", d.driver_id).maybeSingle();
      return {
        driver: d,
        orders: orders || [],
        route: routeState
          ? {
              remaining_stops: routeState.remaining_stops ?? [],
              total_eta_minutes: routeState.total_eta_minutes ?? 0,
              total_distance_km: routeState.total_distance_km ?? 0,
              fallback_mode: routeState.fallback_mode ?? false,
              last_reroute_timestamp: routeState.last_reroute_timestamp,
            }
          : null,
      };
    }

    const driverOrderMatch = path.match(/^\/driver\/orders\/([^/]+)\/(pickup|deliver)$/);
    if (driverOrderMatch && method === "POST") {
      const u = requireDriverOrFounder();
      const oid = driverOrderMatch[1];
      const phase = driverOrderMatch[2];
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) throwErr("No driver profile", 404);
      const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
      if (!o) throwErr("Not found", 404);
      if (o.driver_id !== d.driver_id) throwErr("Not your dispatch", 403);
      if (phase === "pickup") {
        if (o.status !== "assigned_internal") throwErr(`Cannot pickup from status ${o.status}`);
        await db.from("orders").update({ status: "picked_up", updated_at: new Date().toISOString() }).eq("order_id", oid);
        await db.from("deliveries").update({ status: "picked_up" }).eq("order_id", oid);
      } else {
        if (o.status !== "picked_up") throwErr(`Cannot deliver from status ${o.status}`);
        await db.from("orders").update({ status: "delivered", updated_at: new Date().toISOString() }).eq("order_id", oid);
        await db.from("deliveries").update({ status: "delivered" }).eq("order_id", oid);
        const workload = Math.max(0, Number(d.workload || 1) - 1);
        await db.from("drivers").update({ workload, last_seen: new Date().toISOString() }).eq("driver_id", d.driver_id);
      }
      return { ok: true, status: phase === "pickup" ? "picked_up" : "delivered" };
    }

    // ---- Routing intelligence (layer on top of dispatch) ----
    if (path === "/routing/metrics" && method === "GET") {
      const u = requireRole("delivery");
      const { data: d } = await db.from("drivers").select("driver_id").eq("user_id", u.user_id).maybeSingle();
      return getRoutingMetrics(d?.driver_id);
    }
    const routingOptimizeMatch = path.match(/^\/routing\/driver\/([^/]+)\/optimize$/);
    if (routingOptimizeMatch && method === "POST") {
      requireRole("delivery");
      const driverId = routingOptimizeMatch[1];
      const routingDb = createRoutingDbAdapter(db);
      const state = await routingDb.getDriverState(driverId);
      if (!state) throwErr("No route state", 404);
      const result = recalculateOptimalRoute(state, "manual");
      if (result.reroute_applied) {
        await routingDb.saveDriverState({
          ...state,
          current_route: result.route,
          remaining_stops: result.route.filter((s) => !s.completed),
          total_eta_minutes: result.total_eta_minutes,
          total_distance_km: result.total_distance_km,
          last_reroute_timestamp: new Date().toISOString(),
        });
      }
      return result;
    }
    if (path === "/routing/insert-order" && method === "POST") {
      requireRole("admin");
      const { driver_id, order_id } = body as { driver_id: string; order_id: string };
      const routingDb = createRoutingDbAdapter(db);
      const order = await routingDb.getOrderCoords?.(order_id);
      if (!order) throwErr("Order not found", 404);
      return tryInsertOrderIntoRoute(routingDb, driver_id, order);
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

      structuredLog(LOG_EVENTS.CHECKOUT_STARTED, { orderId: order_id, userId: u.user_id });

      if (o.stripe_session_id) {
        const { data: existingTx } = await db
          .from("payment_transactions")
          .select("session_id, payment_status")
          .eq("session_id", o.stripe_session_id)
          .maybeSingle();
        if (existingTx && existingTx.payment_status !== "paid") {
          structuredLog(LOG_EVENTS.STRIPE_SESSION_CREATED, {
            orderId: order_id,
            sessionId: o.stripe_session_id,
            reused: true,
          });
          if (!stripeKey) {
            return {
              url: `${origin_url}/checkout/success?session_id=${o.stripe_session_id}`,
              session_id: o.stripe_session_id,
            };
          }
          const r = await fetchWithRateLimitRetry(
            `https://api.stripe.com/v1/checkout/sessions/${o.stripe_session_id}`,
            { headers: { Authorization: `Bearer ${stripeKey}` } },
            { orderId: order_id, sessionId: o.stripe_session_id }
          );
          const existingSession = await r.json();
          if (r.ok && existingSession.url) {
            return { url: existingSession.url, session_id: o.stripe_session_id };
          }
        }
      }

      if (!stripeKey) {
        const session_id = uid("cs_test");
        const now = new Date().toISOString();
        await db.from("payment_transactions").insert({
          session_id,
          order_id,
          user_id: u.user_id,
          amount: o.total,
          currency: "usd",
          payment_status: "initiated",
          created_at: now,
        });
        await db.from("orders").update({ stripe_session_id: session_id }).eq("order_id", order_id);
        return { url: `${origin_url}/checkout/success?session_id=${session_id}`, session_id };
      }

      const stripeRes = await fetchWithRateLimitRetry(
        "https://api.stripe.com/v1/checkout/sessions",
        {
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
            "payment_intent_data[metadata][order_id]": order_id,
            "payment_intent_data[metadata][user_id]": u.user_id as string,
          }),
        },
        { orderId: order_id }
      );
      const session = await stripeRes.json();
      if (!stripeRes.ok) throwErr(session.error?.message || "Stripe error", 500);
      structuredLog(LOG_EVENTS.STRIPE_SESSION_CREATED, { orderId: order_id, sessionId: session.id });
      const now = new Date().toISOString();
      const { error: txError } = await db.from("payment_transactions").insert({
        session_id: session.id,
        order_id,
        user_id: u.user_id,
        amount: o.total,
        currency: "usd",
        payment_status: "initiated",
        created_at: now,
      });
      if (txError) throwErr(txError.message, 500);
      await db.from("orders").update({ stripe_session_id: session.id }).eq("order_id", order_id);
      return { url: session.url, session_id: session.id };
    }

    const checkoutStatusMatch = path.match(/^\/checkout\/status\/([^/]+)$/);
    if (checkoutStatusMatch && method === "GET") {
      const session_id = checkoutStatusMatch[1];
      const { data: tx } = await db.from("payment_transactions").select("*").eq("session_id", session_id).maybeSingle();

      let orderRow: Record<string, unknown> | null = null;
      if (tx?.order_id) {
        const { data } = await db.from("orders").select("*").eq("order_id", tx.order_id).maybeSingle();
        orderRow = data;
      }
      if (!orderRow) {
        const { data } = await db.from("orders").select("*").eq("stripe_session_id", session_id).maybeSingle();
        orderRow = data;
      }

      if (user && orderRow && orderRow.customer_id !== user.user_id) {
        throwErr("Forbidden", 403);
      }

      let orderPaymentStatus = (orderRow?.payment_status as string) ?? tx?.payment_status ?? "pending";
      const amount = (orderRow?.total as number) ?? tx?.amount ?? 0;

      if (orderPaymentStatus === "paid" || (await alreadyProcessedSession(db, session_id))) {
        return {
          status: "complete",
          payment_status: "paid",
          order_id: orderRow?.order_id ?? tx?.order_id ?? null,
          amount_total: Math.round(amount * 100),
          currency: "usd",
          cached: true,
        };
      }

      if (!stripeKey) {
        return {
          status: "open",
          payment_status: orderPaymentStatus,
          amount_total: Math.round(amount * 100),
          currency: "usd",
        };
      }

      try {
        const r = await fetchWithRateLimitRetry(
          `https://api.stripe.com/v1/checkout/sessions/${session_id}`,
          { headers: { Authorization: `Bearer ${stripeKey}` } },
          { session_id }
        );
        const stripeSession = await r.json();

        if (r.status === 429) {
          return {
            status: "open",
            payment_status: orderPaymentStatus,
            order_id: orderRow?.order_id ?? tx?.order_id ?? null,
            amount_total: Math.round(amount * 100),
            currency: "usd",
            rate_limited: true,
          };
        }

        if (stripeSession?.error) {
          console.error(JSON.stringify({ stripe_error: stripeSession.error.message, session_id }));
        }

        if (stripeSession.payment_status === "paid" && orderRow && orderPaymentStatus !== "paid") {
          const now = new Date().toISOString();
          const paymentIntentId =
            typeof stripeSession.payment_intent === "string" ? stripeSession.payment_intent : null;
          const { error: updateError } = await db
            .from("orders")
            .update({
              payment_status: "paid",
              updated_at: now,
              webhook_processed_at: now,
              ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
            })
            .eq("order_id", orderRow.order_id)
            .neq("payment_status", "paid");

          if (!updateError) {
            if (!tx) {
              await db.from("payment_transactions").insert({
                session_id,
                order_id: orderRow.order_id,
                user_id: orderRow.customer_id,
                amount,
                currency: "usd",
                payment_status: "paid",
                status: "complete",
                created_at: now,
              });
            } else {
              await db
                .from("payment_transactions")
                .update({ payment_status: "paid", status: "complete" })
                .eq("session_id", session_id);
            }
            orderPaymentStatus = "paid";
          }
        }

        const isPaid = stripeSession.payment_status === "paid" || orderPaymentStatus === "paid";

        return {
          status: isPaid ? "complete" : (stripeSession.status ?? "open"),
          payment_status: isPaid ? "paid" : orderPaymentStatus,
          stripe_payment_status: stripeSession.payment_status ?? null,
          order_id: orderRow?.order_id ?? tx?.order_id ?? null,
          amount_total: stripeSession.amount_total ?? Math.round(amount * 100),
          currency: stripeSession.currency ?? "usd",
        };
      } catch (e) {
        console.error(JSON.stringify({ checkout_status_error: e instanceof Error ? e.message : String(e), session_id }));
        return {
          status: "open",
          payment_status: orderPaymentStatus,
          amount_total: Math.round(amount * 100),
          currency: "usd",
          soft_error: true,
        };
      }
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
      const admin = requireRole("admin");
      const restaurantId = approveMatch[1];
      const { data: rest } = await db.from("restaurants").select("owner_id").eq("restaurant_id", restaurantId).maybeSingle();
      await db.from("restaurants").update({
        approved: true,
        approval_status: "approved",
        active: true,
      }).eq("restaurant_id", restaurantId);
      if (rest?.owner_id) {
        await db.from("users").update({ approval_status: "approved", active: true }).eq("user_id", rest.owner_id);
        await db.from("compliance_reviews").update({
          status: "approved",
          approval_status: "approved",
          reviewed_by: admin.user_id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("user_id", rest.owner_id).in("status", ["pending"]);
      }
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

    const importStatusMatch = path.match(/^\/admin\/import-restaurants\/status\/([^/]+)$/);
    if (importStatusMatch && method === "GET") {
      requireRole("admin");
      const progress = await getImportProgress(db, importStatusMatch[1]);
      if (!progress) throwErr("Import not found", 404);
      return progress;
    }

    if (path === "/admin/import-restaurants" && method === "POST") {
      const u = requireRole("admin");
      const city = sanitizeImportString(body.city, 120);
      const state = sanitizeImportString(body.state, 80);
      const radiusRaw = Number(body.radius ?? body.radius_meters ?? 15000);
      const limitRaw = Number(body.limit ?? 100);
      const provider = parseImportProvider(body.provider);

      if (!city || !state) throwErr("City and state are required");
      if (!Number.isFinite(radiusRaw) || radiusRaw < 500 || radiusRaw > 50000) {
        throwErr("Radius must be between 500 and 50000 meters");
      }
      if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 300) {
        throwErr("Limit must be between 1 and 300");
      }
      if (provider === "google" && !hasGooglePlacesApiKey()) {
        throwErr(
          "Google Places API key not configured. Set GOOGLE_PLACES_API_KEY in Supabase secrets, or use OpenStreetMap (free).",
          400
        );
      }

      const importId = newImportId();
      const logBase = {
        import_id: importId,
        user_id: u.user_id as string,
        city,
        state,
        radius_meters: Math.round(radiusRaw),
        limit_requested: Math.round(limitRaw),
        status: "pending",
        progress_pct: 0,
      };
      let { error: logError } = await db
        .from("restaurant_import_logs")
        .insert({ ...logBase, provider });
      if (logError?.message?.includes("provider")) {
        ({ error: logError } = await db.from("restaurant_import_logs").insert(logBase));
      }
      if (logError) throwErr(logError.message, 500);

      const importParams = {
        city,
        state,
        radiusMeters: Math.round(radiusRaw),
        limit: Math.round(limitRaw),
        importId,
        userId: u.user_id as string,
      };

      const importPromise =
        provider === "osm"
          ? runOpenStreetMapImport(db, importParams)
          : runGooglePlacesImport(db, importParams);

      return {
        import_id: importId,
        status: "started",
        provider,
        _background: importPromise,
      };
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
