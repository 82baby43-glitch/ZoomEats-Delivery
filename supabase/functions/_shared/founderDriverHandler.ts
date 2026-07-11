import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessFounderDashboard, hasFounderDriverPermission } from "./founderDriverAuth.ts";
import { assignOrderToDriver, listClaimableOrders, recordOfferEvent } from "./dispatch/offers.ts";
import type { RealtimeRuntime } from "./logistics/delivery-realtime.ts";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

async function requireFounderUser(db: SupabaseClient, userId: string) {
  const { data: user } = await db
    .from("users")
    .select("user_id,role,email,founder_driver,founder_driver_role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!user || !hasFounderDriverPermission(user)) throwErr("Founder Driver access required", 403);
  return user;
}

async function ensureFounderDriverRow(db: SupabaseClient, userId: string, opts: { online?: boolean } = {}) {
  const now = new Date().toISOString();
  const { data: existing } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
  if (existing) {
    await db.from("drivers").update({
      approval_status: "approved",
      agreement_complete: true,
      active: true,
      documents_complete: true,
      availability: opts.online ?? existing.availability,
      last_seen: now,
      updated_at: now,
    }).eq("driver_id", existing.driver_id);
    const { data: refreshed } = await db.from("drivers").select("*").eq("driver_id", existing.driver_id).maybeSingle();
    return refreshed || existing;
  }
  const driver = {
    driver_id: uid("drv"),
    user_id: userId,
    availability: opts.online ?? false,
    workload: 0,
    approval_status: "approved",
    agreement_complete: true,
    active: true,
    documents_complete: true,
    last_seen: now,
  };
  await db.from("drivers").insert(driver);
  return driver;
}

async function updateRestaurantScorecard(db: SupabaseClient, restaurantId: string, log: Record<string, unknown>) {
  const { data: prev } = await db.from("restaurant_scorecard").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  const n = (prev?.sample_count as number) || 0;
  const next = n + 1;
  const avg = (field: string, val: number | null | undefined) => {
    if (val == null) return prev?.[field] ?? null;
    const p = Number(prev?.[field] ?? val);
    return Math.round(((p * n + val) / next) * 100) / 100;
  };
  const diffMap = { easy: 5, medium: 3, hard: 1 };
  const accMap = { accurate: 5, minor_issue: 3, wrong_items: 1 };
  await db.from("restaurant_scorecard").upsert({
    restaurant_id: restaurantId,
    sample_count: next,
    avg_wait_min: avg("avg_wait_min", log.wait_minutes as number),
    avg_order_accuracy: avg("avg_order_accuracy", accMap[log.order_accuracy as keyof typeof accMap]),
    avg_driver_friendliness: avg("avg_driver_friendliness", log.employee_interaction_rating as number),
    avg_parking: avg("avg_parking", diffMap[log.parking_difficulty as keyof typeof diffMap]),
    avg_pickup_speed: avg("avg_pickup_speed", log.wait_minutes != null ? Math.max(1, 30 - Number(log.wait_minutes)) : null),
    updated_at: new Date().toISOString(),
  }, { onConflict: "restaurant_id" });
}

function buildWeeklyInsights(metrics: {
  deliveries: number;
  avgWait: number;
  avgMargin: number;
  avgTip: number;
  topIssue: string;
}) {
  return {
    title: "Founder Driver Summary",
    completed_deliveries: metrics.deliveries,
    most_common_issue: metrics.topIssue,
    recommendation: metrics.avgWait > 12
      ? `Increase prep estimates at restaurants averaging ${metrics.avgWait.toFixed(0)}+ min waits.`
      : "Prep times are within target — focus on dispatch confidence tuning.",
    driver_earnings_opportunity: metrics.avgWait > 12 ? "12%" : "6%",
    customer_satisfaction_delta: "4%",
    suggested_feature: metrics.avgWait > 12 ? "Restaurant Ready Button" : "Pickup photo instructions",
    avg_platform_margin: metrics.avgMargin,
    avg_tip: metrics.avgTip,
  };
}

export async function handleFounderDriverRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    requireAuth: () => Record<string, unknown>;
    runtime?: RealtimeRuntime;
  }
): Promise<unknown | null> {
  const { path, method, body = {}, params = {} } = opts;
  if (!path.startsWith("/founder-driver")) return null;

  const u = opts.requireAuth();
  const userId = String(u.user_id);
  await requireFounderUser(db, userId);

  if (path === "/founder-driver/status" && method === "GET") {
    const user = await requireFounderUser(db, userId);
    const { data: session } = await db
      .from("founder_driver_sessions")
      .select("*")
      .eq("user_id", userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: driver } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
    const { data: activeOrders } = driver
      ? await db.from("orders").select("*").eq("driver_id", driver.driver_id).in("status", [
          "assigned_internal", "arrived_at_store", "picked_up", "out_for_delivery", "arrived_at_customer",
        ])
      : { data: [] };
    const current = (activeOrders || [])[0] || null;
    return {
      permission: true,
      founder_role: user.founder_driver_role || "founder",
      session_active: Boolean(session),
      shadow_dispatch: session?.shadow_dispatch ?? false,
      driver: driver
        ? {
            online: driver.availability,
            busy: (activeOrders || []).length > 0,
            driver_id: driver.driver_id,
          }
        : null,
      current_delivery: current
        ? {
            order_id: current.order_id,
            restaurant: current.restaurant_name,
            customer: current.customer_name,
            address: current.address,
            status: current.status,
            total: current.total,
          }
        : null,
    };
  }

  if (path === "/founder-driver/session" && method === "POST") {
    const action = String(body.action || "start");
    if (action === "stop") {
      await db
        .from("founder_driver_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("ended_at", null);
      const { data: driver } = await db.from("drivers").select("driver_id").eq("user_id", userId).maybeSingle();
      if (driver) {
        await db.from("drivers").update({ availability: false, updated_at: new Date().toISOString() }).eq("driver_id", driver.driver_id);
      }
      return { ok: true, active: false };
    }
    await ensureFounderDriverRow(db, userId, { online: true });
    const sessionId = uid("fds");
    await db.from("founder_driver_sessions").insert({
      session_id: sessionId,
      user_id: userId,
      founder_role: body.founder_role || null,
      shadow_dispatch: !!body.shadow_dispatch,
    });
    return { ok: true, active: true, session_id: sessionId };
  }

  if (path === "/founder-driver/claimable-orders" && method === "GET") {
    const orders = await listClaimableOrders(db, 25);
    return { orders };
  }

  const claimMatch = path.match(/^\/founder-driver\/claim-order$/);
  if (claimMatch && method === "POST") {
    const orderId = String(body.order_id || "");
    if (!orderId) throwErr("order_id required");
    const driver = await ensureFounderDriverRow(db, userId, { online: true });
    const result = await assignOrderToDriver(db, orderId, driver, opts.runtime);
    await recordOfferEvent(db, orderId, "founder_claimed", {
      driverId: String(driver.driver_id),
      message: "Founder driver self-assigned to order",
    });
    return result;
  }

  if (path === "/founder-driver/pickup-log" && method === "POST") {
    const orderId = String(body.order_id || "");
    if (!orderId) throwErr("order_id required");
    const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
    if (!order) throwErr("Order not found", 404);
    const arrival = body.arrival_at ? new Date(String(body.arrival_at)) : new Date();
    const pickup = body.pickup_at ? new Date(String(body.pickup_at)) : new Date();
    const foodReady = body.food_ready_at ? new Date(String(body.food_ready_at)) : null;
    const waitMinutes = body.wait_minutes != null
      ? Number(body.wait_minutes)
      : Math.round((pickup.getTime() - arrival.getTime()) / 60000);
    const recommendation = waitMinutes >= 12
      ? `Restaurant waited ${waitMinutes} minutes. Consider increasing prep estimate by ${Math.max(4, Math.round(waitMinutes * 0.5))} minutes.`
      : null;
    const row = {
      log_id: uid("fpl"),
      user_id: userId,
      order_id: orderId,
      restaurant_id: order.restaurant_id,
      arrival_at: arrival.toISOString(),
      food_ready_at: foodReady?.toISOString() || null,
      pickup_at: pickup.toISOString(),
      wait_minutes: waitMinutes,
      employee_interaction_rating: body.employee_interaction_rating != null ? Number(body.employee_interaction_rating) : null,
      pickup_difficulty: body.pickup_difficulty || null,
      parking_difficulty: body.parking_difficulty || null,
      order_accuracy: body.order_accuracy || null,
      special_notes: body.special_notes || null,
      recommendation,
    };
    await db.from("founder_pickup_logs").insert(row);
    if (order.restaurant_id) await updateRestaurantScorecard(db, order.restaurant_id, row);
    return { ok: true, log: row };
  }

  if (path === "/founder-driver/journal" && method === "POST") {
    const orderId = String(body.order_id || "");
    if (!orderId) throwErr("order_id required");
    const miles = body.miles != null ? Number(body.miles) : null;
    const minutes = body.delivery_minutes != null ? Number(body.delivery_minutes) : null;
    const driverPay = body.driver_pay != null ? Number(body.driver_pay) : null;
    const tip = body.tip != null ? Number(body.tip) : 0;
    const effectiveHourly = driverPay != null && minutes && minutes > 0
      ? Math.round(((driverPay + tip) / (minutes / 60)) * 100) / 100
      : null;
    const row = {
      journal_id: uid("fdj"),
      user_id: userId,
      order_id: orderId,
      dispatch_rating: body.dispatch_rating != null ? Number(body.dispatch_rating) : null,
      navigation_rating: body.navigation_rating != null ? Number(body.navigation_rating) : null,
      restaurant_rating: body.restaurant_rating != null ? Number(body.restaurant_rating) : null,
      customer_rating: body.customer_rating != null ? Number(body.customer_rating) : null,
      parking: body.parking || null,
      safety: body.safety || null,
      notes: body.notes || null,
      platform_revenue: body.platform_revenue != null ? Number(body.platform_revenue) : null,
      driver_pay: driverPay,
      tip,
      miles,
      delivery_minutes: minutes,
      effective_hourly: effectiveHourly,
    };
    await db.from("founder_delivery_journals").insert(row);
    return { ok: true, journal: row };
  }

  if (path === "/founder-driver/dispatch-insight" && method === "GET") {
    const oid = params.order_id || String(body.order_id || "");
    if (!oid) throwErr("order_id required");
    const { data: existing } = await db.from("founder_dispatch_insights").select("*").eq("order_id", oid).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return existing;
    const { data: order } = await db.from("orders").select("*").eq("order_id", oid).maybeSingle();
    if (!order) throwErr("Order not found", 404);
    const breakdown = {
      restaurant_distance: 34,
      customer_distance: 31,
      restaurant_wait_prediction: 22,
      driver_workload: 13,
    };
    const insight = {
      insight_id: uid("fdi"),
      order_id: oid,
      user_id: userId,
      assigned_driver_id: order.driver_id,
      dispatch_score: 87,
      score_breakdown: breakdown,
      decision_reason: order.driver_id ? "Assigned to Founder Driver based on availability and route fit" : "Pending dispatch",
      rejected_drivers: [],
      estimated_payout: 9.25,
      estimated_wait_min: 14,
      profit_prediction: 4.1,
      dispatch_confidence: 0.82,
      shadow_mode: false,
    };
    await db.from("founder_dispatch_insights").insert(insight);
    return insight;
  }

  if (path === "/founder-driver/notes" && method === "POST") {
    const note = String(body.note || "").trim();
    if (!note) throwErr("note required");
    const row = {
      note_id: uid("fon"),
      user_id: userId,
      order_id: body.order_id || null,
      restaurant_id: body.restaurant_id || null,
      note,
    };
    await db.from("founder_order_notes").insert(row);
    return { ok: true, note: row };
  }

  if (path === "/founder-driver/feedback" && method === "POST") {
    const row = {
      feedback_id: uid("fff"),
      user_id: userId,
      order_id: body.order_id || null,
      category: String(body.category || "dispatch"),
      problem: String(body.problem || "").trim() || throwErr("problem required"),
      suggested_fix: body.suggested_fix || null,
      priority: body.priority || "medium",
    };
    await db.from("founder_feature_feedback").insert(row);
    return { ok: true, feedback: row };
  }

  if (path === "/founder-driver/customer-review" && method === "POST") {
    const orderId = String(body.order_id || "");
    if (!orderId) throwErr("order_id required");
    const row = {
      review_id: uid("fcr"),
      user_id: userId,
      order_id: orderId,
      instructions_clarity: body.instructions_clarity != null ? Number(body.instructions_clarity) : null,
      delivery_accuracy: body.delivery_accuracy != null ? Number(body.delivery_accuracy) : null,
      photo_quality: body.photo_quality != null ? Number(body.photo_quality) : null,
      apartment_complexity: body.apartment_complexity || null,
      dropoff_safety: body.dropoff_safety || null,
      navigation_quality: body.navigation_quality != null ? Number(body.navigation_quality) : null,
      notes: body.notes || null,
    };
    await db.from("founder_customer_reviews").insert(row);
    return { ok: true, review: row };
  }

  if (path === "/founder-driver/metrics" && method === "GET") {
    const [{ data: journals }, { data: pickups }, { data: feedback }] = await Promise.all([
      db.from("founder_delivery_journals").select("*").eq("user_id", userId),
      db.from("founder_pickup_logs").select("wait_minutes").eq("user_id", userId),
      db.from("founder_feature_feedback").select("problem,category").eq("user_id", userId).eq("status", "open"),
    ]);
    const j = journals || [];
    const waits = (pickups || []).map((p) => Number(p.wait_minutes)).filter((w) => !Number.isNaN(w));
    const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
    const avgMargin = j.length
      ? j.reduce((s, r) => s + Number(r.platform_revenue || 0), 0) / j.length
      : 0;
    const avgTip = j.length ? j.reduce((s, r) => s + Number(r.tip || 0), 0) / j.length : 0;
    const avgHourly = j.filter((r) => r.effective_hourly).length
      ? j.reduce((s, r) => s + Number(r.effective_hourly || 0), 0) / j.filter((r) => r.effective_hourly).length
      : 0;
    const longWaits = waits.filter((w) => w > 12).length;
    return {
      total_deliveries: j.length,
      average_wait_min: Math.round(avgWait * 10) / 10,
      average_platform_margin: Math.round(avgMargin * 100) / 100,
      average_tip: Math.round(avgTip * 100) / 100,
      average_effective_hourly: Math.round(avgHourly * 100) / 100,
      restaurant_wait_issues: longWaits,
      open_feedback: (feedback || []).length,
      weekly_insights: buildWeeklyInsights({
        deliveries: j.length,
        avgWait,
        avgMargin,
        avgTip,
        topIssue: longWaits > 0 ? "Restaurant waits over 12 minutes" : "Navigation clarity at complex addresses",
      }),
    };
  }

  if (path === "/founder-driver/heatmap" && method === "GET") {
    const { data: pickups } = await db.from("founder_pickup_logs").select("restaurant_id,wait_minutes,recommendation").order("created_at", { ascending: false }).limit(200);
    const { data: scorecards } = await db.from("restaurant_scorecard").select("*").order("avg_wait_min", { ascending: false }).limit(20);
    const highWait = (scorecards || []).filter((s) => Number(s.avg_wait_min) >= 12);
    const fastKitchens = (scorecards || []).filter((s) => Number(s.avg_wait_min) > 0 && Number(s.avg_wait_min) < 8);
    return {
      high_wait_restaurants: highWait,
      slow_kitchens: highWait.slice(0, 6),
      fast_kitchens: fastKitchens.slice(0, 6),
      recent_pickup_signals: (pickups || []).slice(0, 10),
      peak_neighborhoods: [],
      traffic_hotspots: [],
    };
  }

  if (path === "/founder-driver/scorecards" && method === "GET") {
    const { data } = await db.from("restaurant_scorecard").select("*").order("updated_at", { ascending: false }).limit(50);
    return data || [];
  }

  if (path === "/founder-driver/feedback" && method === "GET") {
    const { data } = await db.from("founder_feature_feedback").select("*").order("created_at", { ascending: false }).limit(50);
    return data || [];
  }

  if (path === "/founder-driver/notes" && method === "GET") {
    const { data } = await db.from("founder_order_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    return data || [];
  }

  if (path.startsWith("/founder-driver")) {
    throwErr("Founder driver route not found", 404);
  }

  return null;
}

export { canAccessFounderDashboard };
