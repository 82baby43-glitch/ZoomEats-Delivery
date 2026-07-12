// ZoomEats API — Supabase Edge Function (replaces FastAPI backend)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  LOG_EVENTS,
  alreadyProcessedSession,
  fetchWithRateLimitRetry,
  structuredLog,
} from "../_shared/stripeIdempotency.ts";
import { getStripeApiKey } from "../_shared/stripeEnv.ts";
import { createRoutingDbAdapter } from "../_shared/routing/db-adapter.ts";
import { getRoutingMetrics } from "../_shared/routing/metrics.ts";
import {
  completeRouteStopsForOrder,
  processGpsAndMaybeReroute,
  recalculateOptimalRoute,
  tryInsertOrderIntoRoute,
} from "../_shared/routing/uber-routing-ai.ts";
import {
  getImportProgress,
  hasGooglePlacesApiKey,
  newImportId,
  parseImportProvider,
  runGooglePlacesImport,
  sanitizeImportString,
} from "../_shared/googlePlacesImport.ts";
import { runOpenStreetMapImport } from "../_shared/openStreetMapImport.ts";
import { handleComplianceRequest } from "../_shared/complianceHandler.ts";
import { handlePwaRequest } from "../_shared/pwaHandler.ts";
import { handleMenuImageRequest } from "../_shared/menuImages/handler.ts";
import { handleSpotlightRequest } from "../_shared/spotlight/handler.ts";
import { handleDreamlandRequest } from "../_shared/dreamlandHandler.ts";
import { handleFounderDriverRequest } from "../_shared/founderDriverHandler.ts";
import { canUseDriverApis } from "../_shared/founderDriverAuth.ts";
import { handleLogisticsRequest } from "../_shared/logisticsHandler.ts";
import { buildCustomerTrackingView } from "../_shared/logistics/customer-tracking.ts";
import {
  appendDeliveryRouteHistory,
  persistDriverGpsSample,
} from "../_shared/logistics/gps-persistence.ts";
import { flushGpsBatch } from "../_shared/logistics/gps-batch-writer.ts";
import {
  broadcastDeliveryCompleted,
  broadcastDriverArrived,
  findActiveOrderForDriver,
  getLatestDriverLocation,
  recordDriverLocation,
} from "../_shared/logistics/driver-location-service.ts";
import { recordDeliveryMetrics } from "../_shared/logistics/delivery-metrics-recorder.ts";
import { recordCompletedDeliveryRoute } from "../_shared/logistics/delivery-route-recorder.ts";
import { handlePickupPhotoRequest } from "../_shared/pickupPhotosHandler.ts";
import {
  handleDeliveryWorkflowRequest,
  handleDriverPickup,
  handleVendorOrderReady,
  prepareOrderDeliveryFields,
} from "../_shared/delivery/handler.ts";
import { stripSensitiveOrders } from "../_shared/delivery/sanitize.ts";
import { handleDriverOfferRequest } from "../_shared/dispatch/offer-handler.ts";
import { handleUberDirectAdminRequest } from "../_shared/uberDirectAdmin.ts";
import { handleStripeAdminRequest } from "../_shared/stripeAdmin.ts";
import { handleGeocodeAdminRequest, geocodeOrderAddress } from "../_shared/geocodeAdmin.ts";
import { handleLaunchAuditRequest } from "../_shared/launchAuditHandler.ts";
import { handleFinancialAdminRequest } from "../_shared/financialAdminHandler.ts";
import { handleCompanionRequest } from "../_shared/companionMode/handler.ts";
import { recordOrderFinancials } from "../_shared/financial/engine.ts";
import { handleRestaurantAdminRequest, approveRestaurantWithReadiness } from "../_shared/restaurantAdminHandler.ts";
import { syncRestaurantLaunchState } from "../_shared/restaurant/readiness.ts";
import { normalizeRole } from "../_shared/complianceAuthz.ts";
import { filterPublicRestaurants, isTestRestaurantName } from "../_shared/restaurants.ts";
import { finalizePublicRestaurantList } from "../_shared/restaurantListing.ts";
import { getAdminEmails } from "../_shared/adminEnv.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { logSystemEvent } from "../_shared/systemEvents.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message, status }, status);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey = getStripeApiKey();
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const adminEmails = getAdminEmails();

  const db = createClient(supabaseUrl, serviceKey);

  let payload: { path?: string; method?: string; body?: Record<string, unknown>; params?: Record<string, string> };
  try {
    payload = await req.json();
  } catch {
    return err("bad_json", 400);
  }

  const path = payload.path || "/";
  const method = (payload.method || "GET").toUpperCase();
  const body = payload.body || {};
  const params = payload.params || {};

  // Auth: verify JWT
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  let user: Record<string, unknown> | null = null;

  if (token) {
    const { data: { user: authUser } } = await db.auth.getUser(token);
    if (authUser) {
      const { data: profile } = await db
        .from("users")
        .select("*")
        .or(`user_id.eq.${authUser.id},auth_id.eq.${authUser.id}`)
        .maybeSingle();
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
    const clientKey = String(user?.user_id || "anon");
    const rate = checkRateLimit(clientKey, path, method);
    if (!rate.allowed) {
      await logSystemEvent(db, {
        event_type: "rate_limit_blocked",
        severity: "warn",
        source: path,
        message: `Rate limit exceeded on ${method} ${path}`,
        metadata: { client_key: clientKey, retry_after: rate.retryAfterSec },
      });
      return err(`Rate limit exceeded. Retry in ${rate.retryAfterSec}s`, 429);
    }

    const menuImageResult = await handleMenuImageRequest(db, {
      path,
      method,
      body,
      requireRole,
    });
    if (menuImageResult !== null) return json(menuImageResult);

    const spotlightResult = await handleSpotlightRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
      requireRole,
    });
    if (spotlightResult !== null) return json(spotlightResult);

    const complianceResult = await handleComplianceRequest(db, complianceCtx);
    if (complianceResult !== null) return json(complianceResult);

    const pwaResult = await handlePwaRequest(db, {
      path,
      method,
      body,
      user,
      requireAuth,
    });
    if (pwaResult !== null) return json(pwaResult);

    const uberDirectResult = await handleUberDirectAdminRequest(db, complianceCtx);
    if (uberDirectResult !== null) return json(uberDirectResult);

    const stripeResult = await handleStripeAdminRequest(db, complianceCtx);
    if (stripeResult !== null) return json(stripeResult);

    const geocodeResult = await handleGeocodeAdminRequest(db, complianceCtx);
    if (geocodeResult !== null) return json(geocodeResult);

    const launchAuditResult = await handleLaunchAuditRequest(db, complianceCtx);
    if (launchAuditResult !== null) return json(launchAuditResult);

    const financialResult = await handleFinancialAdminRequest(db, complianceCtx);
    if (financialResult !== null) return json(financialResult);

    const companionResult = await handleCompanionRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
    });
    if (companionResult !== null) return json(companionResult);

    const restaurantAdminResult = await handleRestaurantAdminRequest(db, {
      path,
      method,
      body,
      requireRole,
    });
    if (restaurantAdminResult !== null) return json(restaurantAdminResult);

    const dreamlandResult = await handleDreamlandRequest(db, {
      path,
      method,
      body,
      params,
      anthropicKey,
      requireAuth,
    });
    if (dreamlandResult !== null) return json(dreamlandResult);

    const founderResult = await handleFounderDriverRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
      runtime: { supabaseUrl, serviceKey },
    });
    if (founderResult !== null) return json(founderResult);

    const logisticsResult = await handleLogisticsRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
      requireRole,
    });
    if (logisticsResult !== null) return json(logisticsResult);

    const pickupPhotoResult = await handlePickupPhotoRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
      requireRole,
    });
    if (pickupPhotoResult !== null) return json(pickupPhotoResult);

    const deliveryWorkflowResult = await handleDeliveryWorkflowRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
      requireRole,
      runtime: { supabaseUrl, serviceKey },
    });
    if (deliveryWorkflowResult !== null) return json(deliveryWorkflowResult);

    const driverOfferResult = await handleDriverOfferRequest(db, {
      path,
      method,
      body,
      params,
      requireAuth,
      requireRole,
      runtime: { supabaseUrl, serviceKey },
    });
    if (driverOfferResult !== null) return json(driverOfferResult);

    // ---- Auth ----
    if (path === "/auth/me" && method === "GET") {
      const u = requireAuth();
      return json(u);
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
      return json(finalizePublicRestaurantList(data || [], params));
    }

    const restMatch = path.match(/^\/restaurants\/([^/]+)$/);
    if (restMatch && method === "GET") {
      const rid = restMatch[1];
      const { data: restaurant } = await db.from("restaurants").select("*").eq("restaurant_id", rid).maybeSingle();
      if (!restaurant || isTestRestaurantName(restaurant.name)) return err("Not found", 404);
      const { data: menu } = await db.from("menu_items").select("*").eq("restaurant_id", rid).eq("available", true);
      return json({ restaurant, menu: menu || [] });
    }

    // ---- Vendor ----
    if (path === "/vendor/restaurant" && method === "GET") {
      const u = requireRole("vendor");
      const { data } = await db.from("restaurants").select("*").eq("owner_id", u.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return json(data);
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
        return json(data);
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
      return json(data);
    }
    if (path === "/vendor/menu-items" && method === "GET") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) return json([]);
      const { data } = await db.from("menu_items").select("*").eq("restaurant_id", rest.restaurant_id);
      return json(data || []);
    }
    if (path === "/vendor/menu-items" && method === "POST") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) return err("Create restaurant first");
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
      await syncRestaurantLaunchState(db, rest.restaurant_id);
      return json(data);
    }
    const delMenuMatch = path.match(/^\/vendor\/menu-items\/([^/]+)$/);
    if (delMenuMatch && method === "DELETE") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) return err("No restaurant", 404);
      await db.from("menu_items").delete().eq("item_id", delMenuMatch[1]).eq("restaurant_id", rest.restaurant_id);
      await syncRestaurantLaunchState(db, rest.restaurant_id);
      return json({ ok: true });
    }
    if (path === "/vendor/orders" && method === "GET") {
      const u = requireRole("vendor");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) return json([]);
      const { data } = await db.from("orders").select("*").eq("restaurant_id", rest.restaurant_id).order("created_at", { ascending: false });
      return json(data || []);
    }
    const vendorStatusMatch = path.match(/^\/vendor\/orders\/([^/]+)\/status$/);
    if (vendorStatusMatch && method === "POST") {
      const u = requireRole("vendor");
      const newStatus = body.status as string;
      if (!["accepted", "preparing", "ready"].includes(newStatus)) return err("Invalid status");
      const { data: rest } = await db.from("restaurants").select("restaurant_id").eq("owner_id", u.user_id).limit(1).maybeSingle();
      if (!rest) return err("No restaurant", 404);
      const { data: existing } = await db.from("orders").select("*").eq("order_id", vendorStatusMatch[1]).eq("restaurant_id", rest.restaurant_id).maybeSingle();
      if (!existing) return err("Order not found", 404);
      if (newStatus === "ready") {
        await handleVendorOrderReady(db, existing, rest.restaurant_id, { supabaseUrl, serviceKey });
      } else {
        await db.from("orders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("order_id", vendorStatusMatch[1]).eq("restaurant_id", rest.restaurant_id);
      }
      return json({ ok: true });
    }

    // ---- Orders ----
    if (path === "/orders" && method === "POST") {
      const u = requireAuth();
      const items = (body.items as Array<{ item_id: string; quantity: number }>) || [];
      const restaurant_id = body.restaurant_id as string;
      if (!items.length) return err("Empty cart");
      const { data: rest } = await db.from("restaurants").select("*").eq("restaurant_id", restaurant_id).maybeSingle();
      if (!rest) return err("Restaurant not found", 404);
      const ids = items.map((i) => i.item_id);
      const { data: menuRows } = await db.from("menu_items").select("*").in("item_id", ids).eq("restaurant_id", restaurant_id).eq("available", true);
      const canonical = Object.fromEntries((menuRows || []).map((m) => [m.item_id, m]));
      const missing = ids.filter((id) => !canonical[id]);
      if (missing.length) return err(`Unavailable item(s): ${missing.join(", ")}`);
      const repriced = items.map((line) => {
        const m = canonical[line.item_id];
        const qty = Math.max(1, Math.min(Number(line.quantity), 99));
        return { item_id: m.item_id, name: m.name, price: m.price, quantity: qty, image_url: m.image_url || "" };
      });
      const subtotal = Math.round(repriced.reduce((s, it) => s + it.price * it.quantity, 0) * 100) / 100;
      const delivery_fee = 2.99;
      const total = Math.round((subtotal + delivery_fee) * 100) / 100;
      const deliveryAddress = String(body.address || "").trim();
      const deliveryMethod = body.delivery_method === "leave_at_door" ? "leave_at_door" : "hand_to_me";
      const deliveryInstructions = String(body.delivery_instructions || body.notes || "").trim();
      const requireDeliveryPin = Boolean(body.require_delivery_pin);
      const allowPhotoConfirmation = body.allow_photo_confirmation !== false;
      const geo = deliveryAddress ? await geocodeOrderAddress(deliveryAddress, u.name as string) : null;
      const pinFields = await prepareOrderDeliveryFields({
        delivery_method: deliveryMethod,
        require_delivery_pin: requireDeliveryPin,
        total,
      });
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
        delivery_method: deliveryMethod,
        delivery_instructions: deliveryInstructions,
        require_delivery_pin: requireDeliveryPin,
        allow_photo_confirmation: allowPhotoConfirmation,
        ...pinFields,
        status: "pending_payment",
        payment_status: "pending",
        price_hash: computePriceHash(repriced),
        created_at: new Date().toISOString(),
      };
      const { data, error: insertError } = await db.from("orders").insert(order).select().single();
      if (insertError) return err(insertError.message, 500);
      return json(data);
    }
    if (path === "/orders/my" && method === "GET") {
      const u = requireAuth();
      const { data } = await db.from("orders").select("*").eq("customer_id", u.user_id).order("created_at", { ascending: false });
      return json(data || []);
    }

    const trackingMatch = path.match(/^\/orders\/([^/]+)\/tracking$/);
    if (trackingMatch && method === "GET") {
      const u = requireAuth();
      const oid = trackingMatch[1];
      const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
      if (!o) return err("Not found", 404);
      let allowed = u.role === "admin" || o.customer_id === u.user_id || o.delivery_partner_id === u.user_id;
      if (!allowed && o.restaurant_id) {
        const { data: rest } = await db.from("restaurants").select("owner_id").eq("restaurant_id", o.restaurant_id).maybeSingle();
        if (rest?.owner_id === u.user_id) allowed = true;
      }
      if (!allowed) return err("Forbidden", 403);
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

      let logistics = null;
      let driver_location = null;
      try {
        logistics = await buildCustomerTrackingView(db, o, driver, restaurant, { persistSnapshot: true });
        if (driver?.driver_id) {
          driver_location = await getLatestDriverLocation(db, { orderId: oid })
            ?? await getLatestDriverLocation(db, { driverId: driver.driver_id });
        }
        if (logistics && driver?.driver_id && logistics.routing.route_polyline.length > 1) {
          await appendDeliveryRouteHistory(
            db,
            oid,
            driver.driver_id,
            logistics.routing.route_polyline,
            undefined,
            logistics.routing.eta_dropoff_min
          );
        }
      } catch (e) {
        console.warn(JSON.stringify({ customer_tracking_skipped: String(e) }));
      }

      return json({
        order: o,
        delivery_type: o.delivery_type,
        tracking_id: o.tracking_id,
        driver,
        restaurant,
        customer: o.customer_lat ? { latitude: o.customer_lat, longitude: o.customer_lng, address: o.address } : null,
        delivery,
        logistics,
        routing: logistics?.routing ?? null,
        driver_location,
      });
    }

    // ---- Delivery ----
    if (path === "/delivery/available" && method === "GET") {
      requireDriverOrFounder();
      const { data } = await db
        .from("orders")
        .select("*")
        .eq("status", "ready")
        .is("driver_id", null)
        .is("delivery_partner_id", null)
        .or("delivery_type.is.null,delivery_type.neq.uber")
        .order("created_at", { ascending: false });
      return json(stripSensitiveOrders(data || []));
    }
    if (path === "/delivery/my" && method === "GET") {
      const u = requireDriverOrFounder();
      const { data: driver } = await db.from("drivers").select("driver_id").eq("user_id", u.user_id).maybeSingle();
      if (driver?.driver_id) {
        const { data: internal } = await db
          .from("orders")
          .select("*")
          .eq("driver_id", driver.driver_id)
          .in("status", [
            "assigned_internal", "arrived_at_store", "picked_up", "out_for_delivery", "arrived_at_customer", "ready",
          ])
          .order("created_at", { ascending: false });
        if (internal?.length) return json(stripSensitiveOrders(internal));
      }
      const { data } = await db.from("orders").select("*").eq("delivery_partner_id", u.user_id).order("created_at", { ascending: false });
      return json(stripSensitiveOrders(data || []));
    }
    const deliveryActionMatch = path.match(/^\/delivery\/orders\/([^/]+)\/(accept|deliver)$/);
    if (deliveryActionMatch && method === "POST") {
      const u = requireRole("delivery");
      const [, oid, action] = deliveryActionMatch;
      const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
      if (!o) return err("Not found", 404);
      if (action === "accept") {
        if (o.delivery_partner_id) return err("Already taken");
        await db.from("orders").update({ delivery_partner_id: u.user_id, status: "picked_up" }).eq("order_id", oid);
      } else {
        if (o.delivery_partner_id !== u.user_id) return err("Not your delivery", 403);
        await db.from("orders").update({ status: "delivered" }).eq("order_id", oid);
        try {
          const { data: drv } = await db.from("drivers").select("driver_id").eq("user_id", u.user_id).maybeSingle();
          await recordCompletedDeliveryRoute(db, oid, drv?.driver_id ?? o.driver_id);
        } catch (e) {
          console.warn(JSON.stringify({ delivery_route_skipped: String(e), order_id: oid }));
        }
        try {
          await recordDeliveryMetrics(db, oid);
        } catch (e) {
          console.warn(JSON.stringify({ delivery_metrics_skipped: String(e), order_id: oid }));
        }
        try {
          await recordOrderFinancials(db, oid);
        } catch (e) {
          console.warn(JSON.stringify({ financial_ledger_skipped: String(e), order_id: oid }));
        }
      }
      return json({ ok: true });
    }

    // ---- Driver ----
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

        try {
          const routingDb = createRoutingDbAdapter(db);
          const runtime = { supabaseUrl, serviceKey };
          await processGpsAndMaybeReroute(
            routingDb,
            {
              driver_id: existing.driver_id,
              lat: body.latitude as number,
              lng: body.longitude as number,
              timestamp: now,
            },
            runtime
          );

          const activeOrder = body.order_id
            ? { order_id: String(body.order_id), status: "active_delivery" }
            : await findActiveOrderForDriver(db, existing.driver_id);

          await persistDriverGpsSample(
            db,
            existing.driver_id,
            body.latitude as number,
            body.longitude as number,
            activeOrder?.order_id
          );

          await recordDriverLocation(db, {
            driver_id: existing.driver_id,
            latitude: body.latitude as number,
            longitude: body.longitude as number,
            order_id: activeOrder?.order_id ?? null,
            heading: body.heading as number | undefined,
            speed: body.speed as number | undefined,
            accuracy: body.accuracy as number | undefined,
            battery_level: body.battery_level as number | undefined,
            status: activeOrder ? "active_delivery" : "online",
          }, runtime);
          await flushGpsBatch(db, existing.driver_id);
        } catch (e) {
          console.warn(JSON.stringify({ routing_gps_skipped: String(e) }));
        }

        return json({
          ok: true,
          driver_id: existing.driver_id,
          last_seen: now,
          order_id: (body.order_id as string) || null,
        });
      }
      const driver = { driver_id: uid("drv"), user_id: u.user_id, latitude: body.latitude, longitude: body.longitude, availability: true, workload: 0, last_seen: now };
      await db.from("drivers").insert(driver);
      return json({ ok: true, driver_id: driver.driver_id, last_seen: now });
    }
    if (path === "/driver/availability" && method === "POST") {
      const u = requireDriverOrFounder();
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) return json({ ok: true, available: body.available });
      await db.from("drivers").update({ availability: !!body.available, last_seen: new Date().toISOString() }).eq("driver_id", d.driver_id);
      return json({ ok: true, available: body.available });
    }
    if (path === "/driver/active" && method === "GET") {
      const u = requireDriverOrFounder();
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) return json({ driver: null, orders: [], route: null });
      const { data: orders } = await db.from("orders").select("*").eq("driver_id", d.driver_id).in("status", ["assigned_internal", "arrived_at_store", "picked_up", "out_for_delivery", "arrived_at_customer"]).order("created_at", { ascending: false });
      const { data: routeState } = await db.from("driver_route_states").select("*").eq("driver_id", d.driver_id).maybeSingle();
      return json({
        driver: d,
        orders: stripSensitiveOrders(orders || []),
        route: routeState
          ? {
              remaining_stops: routeState.remaining_stops ?? [],
              total_eta_minutes: routeState.total_eta_minutes ?? 0,
              total_distance_km: routeState.total_distance_km ?? 0,
              fallback_mode: routeState.fallback_mode ?? false,
              last_reroute_timestamp: routeState.last_reroute_timestamp,
              earnings_per_hour_estimate: routeState.earnings_per_hour_estimate ?? null,
            }
          : null,
      });
    }

    const driverOrderMatch = path.match(/^\/driver\/orders\/([^/]+)\/(pickup|deliver)$/);
    if (driverOrderMatch && method === "POST") {
      const u = requireDriverOrFounder();
      const [, oid, phase] = driverOrderMatch;
      const { data: d } = await db.from("drivers").select("*").eq("user_id", u.user_id).maybeSingle();
      if (!d) return err("Driver profile not found", 404);
      const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
      if (!o) return err("Not found", 404);
      if (o.driver_id !== d.driver_id) return err("Not your delivery", 403);

      const routingDb = createRoutingDbAdapter(db);
      const runtime = { supabaseUrl, serviceKey };

      if (phase === "pickup") {
        const result = await handleDriverPickup(db, o, d, body, runtime);
        await completeRouteStopsForOrder(routingDb, d.driver_id, oid, "pickup", runtime);
        return json(result);
      }
      return err("Use POST /driver/orders/:id/complete for delivery completion", 400);
    }

    if (path === "/routing/metrics" && method === "GET") {
      const u = requireRole("delivery");
      const { data: d } = await db.from("drivers").select("driver_id").eq("user_id", u.user_id).maybeSingle();
      return json(getRoutingMetrics(d?.driver_id));
    }
    const routingOptimizeMatch = path.match(/^\/routing\/driver\/([^/]+)\/optimize$/);
    if (routingOptimizeMatch && method === "POST") {
      requireRole("delivery");
      const driverId = routingOptimizeMatch[1];
      const routingDb = createRoutingDbAdapter(db);
      const state = await routingDb.getDriverState(driverId);
      if (!state) return err("No route state", 404);
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
      return json(result);
    }
    if (path === "/routing/insert-order" && method === "POST") {
      requireRole("admin");
      const { driver_id, order_id } = body as { driver_id: string; order_id: string };
      const routingDb = createRoutingDbAdapter(db);
      const order = await routingDb.getOrderCoords?.(order_id);
      if (!order) return err("Order not found", 404);
      return json(await tryInsertOrderIntoRoute(routingDb, driver_id, order, { supabaseUrl, serviceKey }));
    }

    // ---- Checkout ----
    if (path === "/checkout/session" && method === "POST") {
      const u = requireAuth();
      const order_id = body.order_id as string;
      const origin_url = body.origin_url as string;
      if (!order_id || !origin_url) return err("order_id & origin_url required");
      const { data: o } = await db.from("orders").select("*").eq("order_id", order_id).eq("customer_id", u.user_id).maybeSingle();
      if (!o) return err("Order not found", 404);
      if (o.payment_status === "paid") return err("Already paid");

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
            return json({
              url: `${origin_url}/checkout/success?session_id=${o.stripe_session_id}`,
              session_id: o.stripe_session_id,
            });
          }
          const r = await fetchWithRateLimitRetry(
            `https://api.stripe.com/v1/checkout/sessions/${o.stripe_session_id}`,
            { headers: { Authorization: `Bearer ${stripeKey}` } },
            { orderId: order_id, sessionId: o.stripe_session_id }
          );
          const existingSession = await r.json();
          if (r.ok && existingSession.url) {
            return json({ url: existingSession.url, session_id: o.stripe_session_id });
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
        return json({ url: `${origin_url}/checkout/success?session_id=${session_id}`, session_id });
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
      if (!stripeRes.ok) return err(session.error?.message || "Stripe error", 500);
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
      if (txError) return err(txError.message, 500);
      await db.from("orders").update({ stripe_session_id: session.id }).eq("order_id", order_id);
      return json({ url: session.url, session_id: session.id });
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
        return err("Forbidden", 403);
      }

      let orderPaymentStatus = (orderRow?.payment_status as string) ?? tx?.payment_status ?? "pending";
      const amount = (orderRow?.total as number) ?? tx?.amount ?? 0;

      if (orderPaymentStatus === "paid" || (await alreadyProcessedSession(db, session_id))) {
        return json({
          status: "complete",
          payment_status: "paid",
          order_id: orderRow?.order_id ?? tx?.order_id ?? null,
          amount_total: Math.round(amount * 100),
          currency: "usd",
          cached: true,
        });
      }

      if (!stripeKey) {
        return json({
          status: "open",
          payment_status: orderPaymentStatus,
          amount_total: Math.round(amount * 100),
          currency: "usd",
        });
      }

      try {
        const r = await fetchWithRateLimitRetry(
          `https://api.stripe.com/v1/checkout/sessions/${session_id}`,
          { headers: { Authorization: `Bearer ${stripeKey}` } },
          { session_id }
        );
        const stripeSession = await r.json();

        if (r.status === 429) {
          return json({
            status: "open",
            payment_status: orderPaymentStatus,
            order_id: orderRow?.order_id ?? tx?.order_id ?? null,
            amount_total: Math.round(amount * 100),
            currency: "usd",
            rate_limited: true,
          });
        }

        if (stripeSession?.error) {
          console.error(JSON.stringify({ stripe_error: stripeSession.error.message, session_id }));
        }

        if (stripeSession.payment_status === "paid" && orderRow && orderPaymentStatus !== "paid") {
          const syncedAt = new Date().toISOString();
          const paymentIntentId =
            typeof stripeSession.payment_intent === "string" ? stripeSession.payment_intent : null;
          const { error: updateError } = await db
            .from("orders")
            .update({
              payment_status: "paid",
              updated_at: syncedAt,
              webhook_processed_at: syncedAt,
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
                created_at: syncedAt,
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

        return json({
          status: isPaid ? "complete" : (stripeSession.status ?? "open"),
          payment_status: isPaid ? "paid" : orderPaymentStatus,
          stripe_payment_status: stripeSession.payment_status ?? null,
          order_id: orderRow?.order_id ?? tx?.order_id ?? null,
          amount_total: stripeSession.amount_total ?? Math.round(amount * 100),
          currency: stripeSession.currency ?? "usd",
        });
      } catch (e) {
        console.error(JSON.stringify({ checkout_status_error: e instanceof Error ? e.message : String(e), session_id }));
        return json({
          status: "open",
          payment_status: orderPaymentStatus,
          amount_total: Math.round(amount * 100),
          currency: "usd",
          soft_error: true,
        });
      }
    }

    // ---- Wallet ----
    if (path === "/wallet/balance" && method === "GET") {
      const u = requireAuth();
      const { data: w } = await db.from("wallets").select("*").eq("owner_user_id", u.user_id).maybeSingle();
      return json({ available: w?.available || 0, pending: w?.pending || 0 });
    }
    if (path === "/wallet/transactions" && method === "GET") {
      const u = requireAuth();
      const { data: w } = await db.from("wallets").select("wallet_id").eq("owner_user_id", u.user_id).maybeSingle();
      if (!w) return json([]);
      const { data } = await db.from("wallet_transactions").select("*").eq("wallet_id", w.wallet_id).order("created_at", { ascending: false }).limit(200);
      return json(data || []);
    }
    if (path === "/wallet/payout" && method === "POST") {
      requireAuth();
      return json({ payout_id: uid("po"), status: "initiated" });
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
      return json({ users: users || 0, restaurants: restaurants || 0, orders: orders || 0, paid_orders: paidOrders?.length || 0, revenue: Math.round(revenue * 100) / 100 });
    }
    if (path === "/admin/users" && method === "GET") {
      requireRole("admin");
      const { data } = await db.from("users").select("*").order("created_at", { ascending: false });
      return json(data || []);
    }
    if (path === "/admin/restaurants" && method === "GET") {
      requireRole("admin");
      const { data } = await db.from("restaurants").select("*").order("created_at", { ascending: false });
      const rests = data || [];
      const restIds = rests.map((r) => r.restaurant_id);
      const { data: onboardings } = restIds.length
        ? await db.from("restaurant_onboarding").select("restaurant_id,stripe_connect_id,stripe_connect_complete").in("restaurant_id", restIds)
        : { data: [] };
      const obByRest = Object.fromEntries((onboardings || []).map((o) => [o.restaurant_id, o]));
      return json(rests.map((r) => {
        const ob = obByRest[r.restaurant_id];
        const connected = !!(ob?.stripe_connect_id);
        const payoutReady = connected && !!ob?.stripe_connect_complete;
        return { ...r, stripe_connected: connected, stripe_payout_ready: payoutReady };
      }));
    }
    const approveMatch = path.match(/^\/admin\/restaurants\/([^/]+)\/approve$/);
    if (approveMatch && method === "POST") {
      const admin = requireRole("admin");
      return json(await approveRestaurantWithReadiness(db, admin, approveMatch[1]));
    }
    if (path === "/admin/orders" && method === "GET") {
      requireRole("admin");
      const { data } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
      return json(data || []);
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
      return json(events);
    }
    if (path === "/admin/attention" && method === "GET") {
      requireRole("admin");
      const { data: pending } = await db.from("restaurants").select("*").eq("approved", false);
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: stuck } = await db.from("orders").select("*").eq("payment_status", "paid").in("status", ["placed", "accepted", "preparing", "ready", "picked_up"]).lt("created_at", cutoff);
      const { data: failed } = await db.from("payment_transactions").select("*").not("payment_status", "in", "(paid,initiated)").order("created_at", { ascending: false });
      return json({
        pending_restaurants: pending || [],
        stuck_orders: stuck || [],
        failed_payments: failed || [],
        counts: { pending: pending?.length || 0, stuck: stuck?.length || 0, failed: failed?.length || 0 },
      });
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
      return json({
        digest: `Today's pulse: ${todaysOrders?.length || 0} orders, $${gmv.toFixed(2)} GMV. ${pending || 0} restaurant(s) awaiting approval.`,
        stats: { orders: todaysOrders?.length || 0, paid_orders: paid.length, gmv: Math.round(gmv * 100) / 100, pending_approvals: pending || 0 },
      });
    }

    const importStatusMatch = path.match(/^\/admin\/import-restaurants\/status\/([^/]+)$/);
    if (importStatusMatch && method === "GET") {
      requireRole("admin");
      const progress = await getImportProgress(db, importStatusMatch[1]);
      if (!progress) return err("Import not found", 404);
      return json(progress);
    }

    if (path === "/admin/import-restaurants" && method === "POST") {
      const u = requireRole("admin");
      const city = sanitizeImportString(body.city, 120);
      const state = sanitizeImportString(body.state, 80);
      const radiusRaw = Number(body.radius ?? body.radius_meters ?? 15000);
      const limitRaw = Number(body.limit ?? 100);
      const provider = parseImportProvider(body.provider);

      if (!city || !state) return err("City and state are required");
      if (!Number.isFinite(radiusRaw) || radiusRaw < 500 || radiusRaw > 50000) {
        return err("Radius must be between 500 and 50000 meters");
      }
      if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 300) {
        return err("Limit must be between 1 and 300");
      }
      if (provider === "google" && !hasGooglePlacesApiKey()) {
        return err(
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
      if (logError) return err(logError.message, 500);

      const importParams = {
        city,
        state,
        radiusMeters: Math.round(radiusRaw),
        limit: Math.round(limitRaw),
        importId,
        userId: u.user_id as string,
      };

      const runImport =
        provider === "osm"
          ? () => runOpenStreetMapImport(db, importParams)
          : () => runGooglePlacesImport(db, importParams);

      try {
        EdgeRuntime.waitUntil(runImport());
      } catch {
        await runImport();
      }

      return json({ import_id: importId, status: "started", provider });
    }

    if (path === "/" && method === "GET") {
      return json({ app: "ZoomEats", db: "supabase", status: "ok" });
    }

    return err(`Unknown route: ${method} ${path}`, 404);
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const message = (e as { message?: string }).message || "Internal error";
    return err(message, status);
  }
});
