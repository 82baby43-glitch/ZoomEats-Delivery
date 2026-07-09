import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_MODE_UI, VEHICLE_MODES } from "../deliveryModes/constants";
import { deriveOrderRequirements } from "../deliveryModes/eligibility";
import type { DeliveryModeKey, DriverFleetProfile, FleetAnalytics, ModeEarningsStats } from "../deliveryModes/types";

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function resolveDriver(db: SupabaseClient, userId: string) {
  const { data } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

async function loadModeDefinitions(db: SupabaseClient) {
  const { data } = await db
    .from("delivery_mode_definitions")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return data || [];
}

export async function buildDriverFleetProfile(db: SupabaseClient, userId: string): Promise<DriverFleetProfile> {
  const driver = await resolveDriver(db, userId);

  const [modesRes, vehiclesRes, bikeRes, defs] = await Promise.all([
    db.from("driver_delivery_modes").select("*").eq("user_id", userId).order("created_at"),
    db.from("driver_vehicles").select("*").eq("user_id", userId).order("created_at"),
    db.from("driver_bicycle_profiles").select("*").eq("user_id", userId).maybeSingle(),
    loadModeDefinitions(db),
  ]);

  return {
    active_delivery_mode: (driver?.active_delivery_mode as DeliveryModeKey) || null,
    active_vehicle_id: (driver?.active_vehicle_id as string) || null,
    approved_modes: (modesRes.data || []) as DriverFleetProfile["approved_modes"],
    vehicles: (vehiclesRes.data || []) as DriverFleetProfile["vehicles"],
    bicycle_profile: (bikeRes.data as DriverFleetProfile["bicycle_profile"]) || null,
    mode_definitions: defs as DriverFleetProfile["mode_definitions"],
  };
}

async function syncDriverId(db: SupabaseClient, userId: string, driverId: string) {
  await db.from("driver_delivery_modes").update({ driver_id: driverId }).eq("user_id", userId).is("driver_id", null);
  await db.from("driver_vehicles").update({ driver_id: driverId }).eq("user_id", userId).is("driver_id", null);
  await db.from("driver_bicycle_profiles").update({ driver_id: driverId }).eq("user_id", userId).is("driver_id", null);
}

export async function handleDeliveryModesRequest(
  db: SupabaseClient,
  opts: {
    path: string;
    method: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    requireAuth: () => Record<string, unknown>;
    requireRole: (...roles: string[]) => Record<string, unknown>;
  }
): Promise<unknown | null> {
  const { path, method, body = {} } = opts;

  if (!path.startsWith("/delivery-modes") && !path.startsWith("/driver/fleet") && !path.startsWith("/admin/fleet")) {
    return null;
  }

  // Public mode catalog
  if (path === "/delivery-modes/catalog" && method === "GET") {
    const defs = await loadModeDefinitions(db);
    return {
      modes: defs.map((d) => ({
        ...d,
        ui: DELIVERY_MODE_UI[d.mode_key as DeliveryModeKey] || null,
      })),
    };
  }

  // Driver fleet profile
  if (path === "/driver/fleet" && method === "GET") {
    const u = opts.requireAuth();
    return buildDriverFleetProfile(db, String(u.user_id));
  }

  // Onboarding: save selected modes
  if (path === "/delivery-modes/onboarding" && method === "POST") {
    const u = opts.requireRole("delivery", "driver");
    const userId = String(u.user_id);
    const selected = Array.isArray(body.modes) ? (body.modes as string[]) : [];
    if (!selected.length) throwErr("Select at least one delivery method");

    const validKeys = new Set((await loadModeDefinitions(db)).map((d) => d.mode_key));
    for (const key of selected) {
      if (!validKeys.has(key)) throwErr(`Invalid mode: ${key}`);
      await db.from("driver_delivery_modes").upsert(
        {
          user_id: userId,
          mode_key: key,
          approval_status: "pending",
          safety_acknowledged: !!body.safety_acknowledged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,mode_key" }
      );
    }

    const driver = await resolveDriver(db, userId);
    if (driver?.driver_id) await syncDriverId(db, userId, driver.driver_id);

    await db.from("driver_onboarding").upsert(
      {
        user_id: userId,
        selected_delivery_modes: selected,
        delivery_mode_step_complete: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Default active mode to first selected if none set
    if (driver && !driver.active_delivery_mode) {
      await db.from("drivers").update({
        active_delivery_mode: selected[0],
        updated_at: new Date().toISOString(),
      }).eq("driver_id", driver.driver_id);
    }

    return { ok: true, modes: selected };
  }

  // Add/update vehicle
  if (path === "/driver/fleet/vehicles" && method === "POST") {
    const u = opts.requireRole("delivery", "driver");
    const userId = String(u.user_id);
    const modeKey = String(body.mode_key || "car") as DeliveryModeKey;
    if (!VEHICLE_MODES.includes(modeKey)) throwErr("This mode does not use vehicle registration");

    const driver = await resolveDriver(db, userId);
    const vehicleId = (body.vehicle_id as string) || uid("veh");

    const payload = {
      vehicle_id: vehicleId,
      user_id: userId,
      driver_id: driver?.driver_id || null,
      mode_key: modeKey,
      make: body.make || null,
      model: body.model || null,
      year: body.year ? Number(body.year) : null,
      color: body.color || null,
      license_plate: body.license_plate || null,
      insurance_expires_at: body.insurance_expires_at || null,
      registration_expires_at: body.registration_expires_at || null,
      is_active: !!body.is_active,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await db.from("driver_vehicles").upsert(payload, { onConflict: "vehicle_id" }).select().single();
    if (error) throwErr(error.message, 500);

    if (body.is_active && driver?.driver_id) {
      await db.from("driver_vehicles").update({ is_active: false }).eq("user_id", userId).neq("vehicle_id", vehicleId);
      await db.from("drivers").update({ active_vehicle_id: vehicleId }).eq("driver_id", driver.driver_id);
    }

    return data;
  }

  // Bicycle profile
  if (path === "/driver/fleet/bicycle" && method === "POST") {
    const u = opts.requireRole("delivery", "driver");
    const userId = String(u.user_id);
    const driver = await resolveDriver(db, userId);
    const profileId = (body.profile_id as string) || uid("bike");

    const { data, error } = await db.from("driver_bicycle_profiles").upsert(
      {
        profile_id: profileId,
        user_id: userId,
        driver_id: driver?.driver_id || null,
        bike_type: body.bike_type || null,
        cargo_bag_capacity: body.cargo_bag_capacity || null,
        is_electric: !!body.is_electric,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    ).select().single();
    if (error) throwErr(error.message, 500);
    return data;
  }

  // Switch active delivery mode
  if (path === "/driver/fleet/switch-mode" && method === "POST") {
    const u = opts.requireRole("delivery", "driver");
    const userId = String(u.user_id);
    const toMode = String(body.mode_key) as DeliveryModeKey;
    if (!toMode) throwErr("mode_key required");

    const driver = await resolveDriver(db, userId);
    if (!driver) throwErr("Driver profile not found", 404);

    const { data: approved } = await db
      .from("driver_delivery_modes")
      .select("*")
      .eq("user_id", userId)
      .eq("mode_key", toMode)
      .eq("approval_status", "approved")
      .maybeSingle();

    // Allow switching to pending modes during onboarding; require approved when going online
    const { data: anyMode } = await db
      .from("driver_delivery_modes")
      .select("*")
      .eq("user_id", userId)
      .eq("mode_key", toMode)
      .maybeSingle();

    if (!anyMode && !approved) throwErr(`Mode ${toMode} not registered`);

    const fromMode = driver.active_delivery_mode as string | null;

    await db.from("drivers").update({
      active_delivery_mode: toMode,
      updated_at: new Date().toISOString(),
    }).eq("driver_id", driver.driver_id);

    // Auto-select active vehicle for vehicle modes
    if (VEHICLE_MODES.includes(toMode)) {
      const { data: veh } = await db
        .from("driver_vehicles")
        .select("vehicle_id")
        .eq("user_id", userId)
        .eq("mode_key", toMode)
        .order("is_active", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (veh) {
        await db.from("drivers").update({ active_vehicle_id: veh.vehicle_id }).eq("driver_id", driver.driver_id);
      }
    } else {
      await db.from("drivers").update({ active_vehicle_id: null }).eq("driver_id", driver.driver_id);
    }

    await db.from("delivery_mode_events").insert({
      event_id: uid("dme"),
      driver_id: driver.driver_id,
      user_id: userId,
      from_mode: fromMode,
      to_mode: toMode,
      event_type: "mode_switch",
      created_at: new Date().toISOString(),
    });

    return { ok: true, active_delivery_mode: toMode };
  }

  // Driver earnings by mode
  if (path === "/driver/fleet/earnings" && method === "GET") {
    const u = opts.requireRole("delivery", "driver");
    const driver = await resolveDriver(db, String(u.user_id));
    if (!driver) return { by_mode: [] as ModeEarningsStats[] };

    const { data: orders } = await db
      .from("orders")
      .select("order_id,total,status,created_at,updated_at,assigned_delivery_mode,delivery_distance_km")
      .eq("driver_id", driver.driver_id)
      .eq("status", "delivered")
      .order("created_at", { ascending: false })
      .limit(500);

    const byMode: Record<string, ModeEarningsStats> = {};
    for (const o of orders || []) {
      const mode = (o.assigned_delivery_mode || driver.active_delivery_mode || "car") as DeliveryModeKey;
      if (!byMode[mode]) {
        byMode[mode] = {
          mode_key: mode,
          deliveries: 0,
          total_earnings: 0,
          avg_earnings: 0,
          total_distance_km: 0,
          avg_delivery_min: 0,
          acceptance_rate: 0.92,
          completion_rate: 0.98,
        };
      }
      const created = new Date(String(o.created_at)).getTime();
      const updated = new Date(String(o.updated_at || o.created_at)).getTime();
      const mins = Math.max(5, (updated - created) / 60000);
      byMode[mode].deliveries += 1;
      byMode[mode].total_earnings += Number(o.total || 0) * 0.15;
      byMode[mode].total_distance_km += Number(o.delivery_distance_km || 3);
      byMode[mode].avg_delivery_min += mins;
    }

    const stats = Object.values(byMode).map((s) => ({
      ...s,
      avg_earnings: s.deliveries ? s.total_earnings / s.deliveries : 0,
      avg_delivery_min: s.deliveries ? s.avg_delivery_min / s.deliveries : 0,
    }));

    return { by_mode: stats };
  }

  // Admin: fleet overview for a driver
  const adminDriverMatch = path.match(/^\/admin\/fleet\/drivers\/([^/]+)$/);
  if (adminDriverMatch && method === "GET") {
    opts.requireRole("admin");
    const userId = adminDriverMatch[1];
    return buildDriverFleetProfile(db, userId);
  }

  // Admin: approve mode
  if (path === "/admin/fleet/approve-mode" && method === "POST") {
    const admin = opts.requireRole("admin");
    const userId = String(body.user_id);
    const modeKey = String(body.mode_key);
    const status = String(body.status || "approved");

    await db.from("driver_delivery_modes").update({
      approval_status: status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      approved_by: String(admin.user_id),
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("mode_key", modeKey);

    return { ok: true };
  }

  // Admin: fleet analytics
  if (path === "/admin/fleet/analytics" && method === "GET") {
    opts.requireRole("admin");

    const [{ data: modeRows }, { data: orders }] = await Promise.all([
      db.from("driver_delivery_modes").select("mode_key,approval_status"),
      db.from("orders").select("assigned_delivery_mode,status,created_at,updated_at,total").eq("status", "delivered").limit(1000),
    ]);

    const modeCounts: Record<string, number> = {};
    for (const r of modeRows || []) {
      if (r.approval_status === "approved") {
        modeCounts[r.mode_key] = (modeCounts[r.mode_key] || 0) + 1;
      }
    }
    const totalDrivers = Object.values(modeCounts).reduce((a, b) => a + b, 0) || 1;

    const deliveryByMode: Record<string, { count: number; totalMin: number; totalEarn: number; completed: number }> = {};
    for (const o of orders || []) {
      const mode = String(o.assigned_delivery_mode || "car");
      if (!deliveryByMode[mode]) deliveryByMode[mode] = { count: 0, totalMin: 0, totalEarn: 0, completed: 0 };
      deliveryByMode[mode].count += 1;
      deliveryByMode[mode].completed += 1;
      const created = new Date(String(o.created_at)).getTime();
      const updated = new Date(String(o.updated_at || o.created_at)).getTime();
      deliveryByMode[mode].totalMin += Math.max(5, (updated - created) / 60000);
      deliveryByMode[mode].totalEarn += Number(o.total || 0) * 0.15;
    }

    const analytics: FleetAnalytics = {
      mode_popularity: Object.entries(modeCounts).map(([mode_key, count]) => ({
        mode_key,
        count,
        pct: Math.round((count / totalDrivers) * 100),
      })),
      avg_delivery_time_by_mode: Object.entries(deliveryByMode).map(([mode_key, v]) => ({
        mode_key,
        avg_min: v.count ? Math.round(v.totalMin / v.count) : 0,
      })),
      avg_earnings_by_mode: Object.entries(deliveryByMode).map(([mode_key, v]) => ({
        mode_key,
        avg: v.count ? Math.round((v.totalEarn / v.count) * 100) / 100 : 0,
      })),
      dispatch_efficiency_by_mode: Object.entries(deliveryByMode).map(([mode_key, v]) => ({
        mode_key,
        completion_rate: v.count ? Math.round((v.completed / v.count) * 100) / 100 : 0,
      })),
    };

    return analytics;
  }

  // Admin: list all drivers with fleet info
  if (path === "/admin/fleet/drivers" && method === "GET") {
    opts.requireRole("admin");
    const { data: drivers } = await db
      .from("drivers")
      .select("driver_id,user_id,active_delivery_mode,active_vehicle_id,availability,users(name,email)")
      .order("updated_at", { ascending: false })
      .limit(100);

    const enriched = [];
    for (const d of drivers || []) {
      const fleet = await buildDriverFleetProfile(db, d.user_id);
      enriched.push({ ...d, fleet });
    }
    return { drivers: enriched };
  }

  throwErr("Delivery modes route not found", 404);
}

/** Used by dispatch — check if driver mode fits order. */
export async function isDriverEligibleForOrder(
  db: SupabaseClient,
  driver: Record<string, unknown>,
  order: Record<string, unknown>
): Promise<boolean> {
  const modeKey = (driver.active_delivery_mode as DeliveryModeKey) || "car";
  const { data: modeDef } = await db
    .from("delivery_mode_definitions")
    .select("*")
    .eq("mode_key", modeKey)
    .maybeSingle();
  if (!modeDef) return true;

  const { isModeEligibleForOrder } = await import("../deliveryModes/eligibility");
  const req = deriveOrderRequirements(order);

  // Compute distance if missing
  if (!req.delivery_distance_km && order.customer_lat && order.restaurant_id) {
    const { data: rest } = await db
      .from("restaurants")
      .select("latitude,longitude")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();
    if (rest?.latitude && order.customer_lat) {
      const { haversineKm } = await import("../dispatch/routing/geo");
      req.delivery_distance_km = haversineKm(
        { lat: Number(rest.latitude), lng: Number(rest.longitude) },
        { lat: Number(order.customer_lat), lng: Number(order.customer_lng) }
      );
    }
  }

  return isModeEligibleForOrder(modeDef, req).eligible;
}
