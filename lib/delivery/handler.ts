import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseDriverApis } from "../founderDriver/auth";
import {
  CUSTOMER_MILESTONE_MESSAGES,
  driverVisibleDeliveryPrefs,
  generateDeliveryPin,
  hashDeliveryPin,
  isWithinGpsRadius,
  MAX_PIN_ATTEMPTS,
  minutesBetween,
  notifyDeliveryMilestone,
  recordDeliveryEvent,
  shouldRequireDeliveryPin,
  uid,
  verifyDeliveryPinHash,
} from "./workflow";
import {
  broadcastDeliveryCompleted,
  broadcastDriverArrived,
} from "../logistics/driver-location-service";
import { recordDeliveryMetrics } from "../logistics/delivery-metrics-recorder";
import { recordCompletedDeliveryRoute } from "../logistics/delivery-route-recorder";
import { recordOrderFinancials } from "../financial/engine";
import type { RealtimeRuntime } from "../logistics/delivery-realtime";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

async function loadDriverOrder(
  db: SupabaseClient,
  userId: string,
  orderId: string
) {
  const { data: d } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
  if (!d) throwErr("No driver profile", 404);
  const { data: o } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!o) throwErr("Not found", 404);
  if (o.driver_id !== d.driver_id) throwErr("Not your dispatch", 403);
  return { driver: d, order: o };
}

async function completeDelivery(
  db: SupabaseClient,
  order: Record<string, unknown>,
  driver: Record<string, unknown>,
  runtime: RealtimeRuntime | undefined,
  extra: Record<string, unknown> = {}
) {
  const now = new Date().toISOString();
  const pickedUpAt = String(order.picked_up_at || order.updated_at || order.created_at);
  const deliveryDuration = minutesBetween(pickedUpAt, now);

  await db
    .from("orders")
    .update({
      status: "delivered",
      delivered_at: now,
      delivery_duration: deliveryDuration,
      updated_at: now,
      ...extra,
    })
    .eq("order_id", order.order_id);

  await db.from("deliveries").update({ status: "delivered" }).eq("order_id", order.order_id);

  const workload = Math.max(0, Number(driver.workload || 1) - 1);
  await db
    .from("drivers")
    .update({ workload, last_seen: now })
    .eq("driver_id", driver.driver_id);

  await recordDeliveryEvent(db, String(order.order_id), "delivered", {
    actorRole: "driver",
    actorId: String(driver.driver_id),
    message: CUSTOMER_MILESTONE_MESSAGES.delivered,
  });

  try {
    await broadcastDeliveryCompleted(String(order.order_id), String(driver.driver_id), runtime);
    await notifyDeliveryMilestone(
      String(order.order_id),
      "delivery_completed",
      { driver_id: driver.driver_id, status: "delivered", message: CUSTOMER_MILESTONE_MESSAGES.delivered },
      runtime
    );
  } catch (e) {
    console.warn(JSON.stringify({ delivery_completed_broadcast_skipped: String(e) }));
  }

  try {
    await recordCompletedDeliveryRoute(db, String(order.order_id), String(driver.driver_id));
  } catch (e) {
    console.warn(JSON.stringify({ delivery_route_skipped: String(e) }));
  }
  try {
    await recordDeliveryMetrics(db, String(order.order_id));
  } catch (e) {
    console.warn(JSON.stringify({ delivery_metrics_skipped: String(e) }));
  }
  try {
    await recordOrderFinancials(db, String(order.order_id));
  } catch (e) {
    console.warn(JSON.stringify({ financial_ledger_skipped: String(e) }));
  }
}

export async function prepareOrderDeliveryFields(order: {
  delivery_method?: string | null;
  require_delivery_pin?: boolean | null;
  total?: number | null;
}) {
  const requirePin = shouldRequireDeliveryPin(order);
  if (!requirePin) {
    return { delivery_verification_code: null, delivery_verification_code_hash: null };
  }
  const pin = generateDeliveryPin();
  const pinHash = await hashDeliveryPin(pin);
  return { delivery_verification_code: pin, delivery_verification_code_hash: pinHash };
}

export async function handleDeliveryWorkflowRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body: Record<string, unknown>;
    params: Record<string, string>;
    requireAuth: () => Record<string, unknown>;
    requireRole: (...roles: string[]) => Record<string, unknown>;
    runtime?: RealtimeRuntime;
  }
): Promise<unknown | null> {
  const { path, method, body, runtime } = opts;

  const arriveStoreMatch = path.match(/^\/driver\/orders\/([^/]+)\/arrive-store$/);
  if (arriveStoreMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const { driver, order } = await loadDriverOrder(db, String(u.user_id), arriveStoreMatch[1]);
    if (!["assigned_internal", "ready"].includes(String(order.status))) {
      throwErr(`Cannot mark arrived at store from status ${order.status}`);
    }

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const { data: rest } = order.restaurant_id
      ? await db.from("restaurants").select("latitude,longitude").eq("restaurant_id", order.restaurant_id).maybeSingle()
      : { data: null };
    const targetLat = Number(rest?.latitude ?? order.restaurant_lat ?? 0);
    const targetLng = Number(rest?.longitude ?? order.restaurant_lng ?? 0);
    if (!isWithinGpsRadius(lat, lng, targetLat, targetLng)) {
      throwErr("GPS verification failed — move closer to the restaurant (within 100m)", 400);
    }

    const now = new Date().toISOString();
    await db
      .from("orders")
      .update({ status: "arrived_at_store", driver_arrived_at: now, updated_at: now })
      .eq("order_id", order.order_id);

    await recordDeliveryEvent(db, String(order.order_id), "arrived_at_store", {
      actorRole: "driver",
      actorId: String(driver.driver_id),
      message: CUSTOMER_MILESTONE_MESSAGES.arrived_at_store,
      latitude: lat,
      longitude: lng,
    });

    try {
      await broadcastDriverArrived(String(order.order_id), String(driver.driver_id), runtime);
      await notifyDeliveryMilestone(
        String(order.order_id),
        "driver_arrived",
        { driver_id: driver.driver_id, phase: "restaurant", message: CUSTOMER_MILESTONE_MESSAGES.arrived_at_store },
        runtime
      );
    } catch (e) {
      console.warn(JSON.stringify({ arrive_store_broadcast_skipped: String(e) }));
    }

    return { ok: true, status: "arrived_at_store" };
  }

  const arriveCustomerMatch = path.match(/^\/driver\/orders\/([^/]+)\/arrive-customer$/);
  if (arriveCustomerMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const { driver, order } = await loadDriverOrder(db, String(u.user_id), arriveCustomerMatch[1]);
    if (!["picked_up", "out_for_delivery"].includes(String(order.status))) {
      throwErr(`Cannot mark arrived at customer from status ${order.status}`);
    }

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const targetLat = Number(order.customer_lat ?? 0);
    const targetLng = Number(order.customer_lng ?? 0);
    if (!isWithinGpsRadius(lat, lng, targetLat, targetLng)) {
      throwErr("GPS verification failed — move closer to the customer (within 100m)", 400);
    }

    const now = new Date().toISOString();
    await db
      .from("orders")
      .update({ status: "arrived_at_customer", customer_arrived_at: now, updated_at: now })
      .eq("order_id", order.order_id);

    await recordDeliveryEvent(db, String(order.order_id), "arrived_at_customer", {
      actorRole: "driver",
      actorId: String(driver.driver_id),
      message: CUSTOMER_MILESTONE_MESSAGES.arrived_at_customer,
      latitude: lat,
      longitude: lng,
    });

    await notifyDeliveryMilestone(
      String(order.order_id),
      "driver_arrived",
      { driver_id: driver.driver_id, phase: "customer", message: CUSTOMER_MILESTONE_MESSAGES.arrived_at_customer },
      runtime
    );

    return {
      ok: true,
      status: "arrived_at_customer",
      delivery_prefs: driverVisibleDeliveryPrefs(order),
    };
  }

  const verifyPinMatch = path.match(/^\/driver\/orders\/([^/]+)\/verify-pin$/);
  if (verifyPinMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const { order } = await loadDriverOrder(db, String(u.user_id), verifyPinMatch[1]);
    if (!["arrived_at_customer", "picked_up", "out_for_delivery"].includes(String(order.status))) {
      throwErr("Arrive at the customer before verifying PIN");
    }
    if (!shouldRequireDeliveryPin(order)) {
      return { ok: true, verified: true, pin_required: false };
    }

    const pin = String(body.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) throwErr("Enter the 6-digit delivery PIN");

    const attempts = Number(order.verification_attempts || 0) + 1;
    const valid = await verifyDeliveryPinHash(pin, order.delivery_verification_code_hash);

    if (!valid) {
      await db.from("orders").update({ verification_attempts: attempts, updated_at: new Date().toISOString() }).eq("order_id", order.order_id);
      await recordDeliveryEvent(db, String(order.order_id), "pin_failed", {
        actorRole: "driver",
        actorId: String(u.user_id),
        message: `Incorrect PIN (attempt ${attempts})`,
        meta: { attempts },
      });
      if (attempts >= MAX_PIN_ATTEMPTS) {
        throwErr("Too many incorrect PIN attempts — contact ZoomEats support", 429);
      }
      throwErr(`Incorrect PIN. ${MAX_PIN_ATTEMPTS - attempts} attempt(s) remaining`);
    }

    await db
      .from("orders")
      .update({
        verification_success: true,
        verification_attempts: attempts,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.order_id);

    await recordDeliveryEvent(db, String(order.order_id), "pin_verified", {
      actorRole: "driver",
      actorId: String(u.user_id),
      message: CUSTOMER_MILESTONE_MESSAGES.pin_verified,
    });

    return { ok: true, verified: true, pin_required: true };
  }

  const photoPresignMatch = path.match(/^\/driver\/orders\/([^/]+)\/delivery-photo\/presign$/);
  if (photoPresignMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const { order } = await loadDriverOrder(db, String(u.user_id), photoPresignMatch[1]);
    if (order.delivery_method !== "leave_at_door") {
      throwErr("Photo proof is only required for Leave at Door deliveries");
    }
    const storagePath = `${order.order_id}/${uid("proof")}.jpg`;
    const { data, error } = await db.storage.from("delivery-photos").createSignedUploadUrl(storagePath);
    if (error) throwErr(error.message, 500);
    return { upload_url: data?.signedUrl, storage_path: storagePath, token: data?.token };
  }

  const completeMatch = path.match(/^\/driver\/orders\/([^/]+)\/complete$/);
  if (completeMatch && method === "POST") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const { driver, order } = await loadDriverOrder(db, String(u.user_id), completeMatch[1]);
    const status = String(order.status);
    if (!["arrived_at_customer", "picked_up", "out_for_delivery"].includes(status)) {
      throwErr(`Cannot complete delivery from status ${status}`);
    }

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const targetLat = Number(order.customer_lat ?? 0);
    const targetLng = Number(order.customer_lng ?? 0);
    const gpsOk = isWithinGpsRadius(lat, lng, targetLat, targetLng);
    const method = String(order.delivery_method || "hand_to_me");
    const pinRequired = shouldRequireDeliveryPin(order);

    if (method === "leave_at_door") {
      const storagePath = String(body.storage_path || "");
      if (!storagePath.startsWith(`${order.order_id}/`)) throwErr("Upload a delivery photo first");
      if (!gpsOk) throwErr("GPS verification failed at delivery location", 400);

      const { data: signed } = await db.storage.from("delivery-photos").createSignedUrl(storagePath, 86400);
      const now = new Date().toISOString();
      await completeDelivery(db, order, driver, runtime, {
        delivery_photo_url: signed?.signedUrl || storagePath,
        delivery_photo_timestamp: now,
        delivery_gps_lat: lat,
        delivery_gps_lng: lng,
        gps_verified: true,
        delivery_note: body.note ? String(body.note).slice(0, 500) : null,
        delivery_verification_code: null,
        delivery_verification_code_hash: null,
      });

      await recordDeliveryEvent(db, String(order.order_id), "photo_uploaded", {
        actorRole: "driver",
        actorId: String(driver.driver_id),
        message: CUSTOMER_MILESTONE_MESSAGES.photo_uploaded,
        latitude: lat,
        longitude: lng,
        meta: { storage_path: storagePath },
      });

      return { ok: true, status: "delivered", gps_verified: true };
    }

    if (pinRequired && !order.verification_success) {
      throwErr("Verify the customer delivery PIN before completing");
    }

    if (!gpsOk && status !== "arrived_at_customer") {
      throwErr("GPS verification failed — confirm arrival at the customer address", 400);
    }

    await completeDelivery(db, order, driver, runtime, {
      delivery_gps_lat: lat,
      delivery_gps_lng: lng,
      gps_verified: gpsOk,
      delivery_note: body.note ? String(body.note).slice(0, 500) : null,
      delivery_verification_code: null,
      delivery_verification_code_hash: null,
    });

    return { ok: true, status: "delivered", gps_verified: gpsOk };
  }

  const pinMatch = path.match(/^\/orders\/([^/]+)\/delivery-pin$/);
  if (pinMatch && method === "GET") {
    const u = opts.requireAuth();
    const oid = pinMatch[1];
    const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
    if (!o || o.customer_id !== u.user_id) throwErr("Forbidden", 403);
    if (!shouldRequireDeliveryPin(o)) return { pin_required: false, pin: null };
    if (!["arrived_at_customer", "picked_up", "out_for_delivery"].includes(String(o.status))) {
      return { pin_required: true, pin: null, message: "PIN will appear when your driver arrives" };
    }
    if (!o.delivery_verification_code) {
      return { pin_required: true, pin: null, message: "PIN not available for this order" };
    }
    return { pin_required: true, pin: o.delivery_verification_code };
  }

  const timelineMatch = path.match(/^\/admin\/orders\/([^/]+)\/delivery-timeline$/);
  if (timelineMatch && method === "GET") {
    opts.requireRole("admin");
    const oid = timelineMatch[1];
    const { data: o } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
    if (!o) throwErr("Not found", 404);
    const { data: events } = await db
      .from("delivery_events")
      .select("*")
      .eq("order_id", oid)
      .order("created_at", { ascending: true });
    return { order: o, events: events || [] };
  }

  const prefsMatch = path.match(/^\/driver\/orders\/([^/]+)\/delivery-prefs$/);
  if (prefsMatch && method === "GET") {
    const u = opts.requireAuth();
    if (!canUseDriverApis(u as { user_id: string; role?: string; founder_driver?: boolean })) {
      throwErr("Delivery access required", 403);
    }
    const { order } = await loadDriverOrder(db, String(u.user_id), prefsMatch[1]);
    return driverVisibleDeliveryPrefs(order);
  }

  return null;
}

/** Enhanced pickup — requires restaurant ready + GPS at store when applicable */
export async function handleDriverPickup(
  db: SupabaseClient,
  order: Record<string, unknown>,
  driver: Record<string, unknown>,
  body: Record<string, unknown>,
  runtime?: RealtimeRuntime
) {
  const status = String(order.status);
  if (!["assigned_internal", "arrived_at_store", "ready"].includes(status)) {
    throwErr(`Cannot pickup from status ${status}`);
  }
  if (!order.restaurant_ready_at && status !== "ready") {
    throwErr("Restaurant has not marked the order ready yet");
  }

  const now = new Date().toISOString();
  await db
    .from("orders")
    .update({ status: "picked_up", picked_up_at: now, updated_at: now })
    .eq("order_id", order.order_id);
  await db.from("deliveries").update({ status: "picked_up" }).eq("order_id", order.order_id);

  await recordDeliveryEvent(db, String(order.order_id), "picked_up", {
    actorRole: "driver",
    actorId: String(driver.driver_id),
    message: CUSTOMER_MILESTONE_MESSAGES.picked_up,
    latitude: body.latitude != null ? Number(body.latitude) : undefined,
    longitude: body.longitude != null ? Number(body.longitude) : undefined,
  });

  await notifyDeliveryMilestone(
    String(order.order_id),
    "driver_arrived",
    { driver_id: driver.driver_id, phase: "picked_up", message: CUSTOMER_MILESTONE_MESSAGES.picked_up },
    runtime
  );

  return { ok: true, status: "picked_up" };
}

export async function handleVendorOrderReady(
  db: SupabaseClient,
  order: Record<string, unknown>,
  restaurantId: string,
  runtime?: RealtimeRuntime
) {
  const now = new Date().toISOString();
  const keepDriverStatus = ["assigned_internal", "arrived_at_store", "picked_up", "out_for_delivery", "arrived_at_customer"].includes(
    String(order.status)
  );
  const nextStatus = keepDriverStatus ? order.status : "ready";

  await db
    .from("orders")
    .update({
      status: nextStatus,
      restaurant_ready_at: now,
      updated_at: now,
    })
    .eq("order_id", order.order_id)
    .eq("restaurant_id", restaurantId);

  await recordDeliveryEvent(db, String(order.order_id), "order_ready", {
    actorRole: "vendor",
    message: CUSTOMER_MILESTONE_MESSAGES.order_ready,
  });

  await notifyDeliveryMilestone(
    String(order.order_id),
    "driver_arrived",
    { phase: "order_ready", message: CUSTOMER_MILESTONE_MESSAGES.order_ready },
    runtime
  );
}

export async function handleDispatchAssigned(
  db: SupabaseClient,
  orderId: string,
  driverId: string,
  runtime?: RealtimeRuntime
) {
  await recordDeliveryEvent(db, orderId, "driver_assigned", {
    actorRole: "system",
    actorId: driverId,
    message: CUSTOMER_MILESTONE_MESSAGES.driver_assigned,
  });
  await notifyDeliveryMilestone(
    orderId,
    "driver_arrived",
    { driver_id: driverId, phase: "driver_assigned", message: CUSTOMER_MILESTONE_MESSAGES.driver_assigned },
    runtime
  );
}
