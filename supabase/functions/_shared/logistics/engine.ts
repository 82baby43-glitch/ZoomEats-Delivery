import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "../routing/geo.ts";
import { etaMinutesBetween } from "../routing/eta-engine.ts";
import type {
  AdminLogisticsView,
  DeliveryQueueItem,
  DemandHotspot,
  DriverEarningsPanel,
  DriverLogisticsView,
  DriverMapStatus,
  DriverPerformancePanel,
  LogisticsMarker,
  RestaurantActiveOrder,
  RestaurantLogisticsView,
  RestaurantPerformancePanel,
  RoutePolyline,
} from "./types.ts";
import { buildDispatchExplain } from "./dispatchExplain.ts";
import { MODE_MAP_ICONS } from "../deliveryModes/constants.ts";

const ACTIVE_ORDER_STATUSES = [
  "placed", "confirmed", "accepted", "preparing", "ready",
  "assigned_internal", "assigned_uber", "picked_up", "out_for_delivery",
];

function deriveDriverStatus(driver: Record<string, unknown> | null, orders: Array<Record<string, unknown>>): DriverMapStatus {
  if (!driver?.availability) return "offline";
  const active = orders.filter((o) => !["delivered", "cancelled"].includes(String(o.status)));
  if (!active.length) return "available";
  const status = String(active[0]?.status || "");
  if (status === "assigned_internal" || status === "ready") return "en_route";
  if (status === "picked_up" || status === "out_for_delivery") return "delivering";
  return "waiting";
}

function orderAgeMin(createdAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
}

function buildHotspots(orders: Array<Record<string, unknown>>, restaurants: Array<Record<string, unknown>>): DemandHotspot[] {
  const counts = new Map<string, { lat: number; lng: number; n: number; name: string }>();
  for (const o of orders) {
    const lat = Number(o.customer_lat);
    const lng = Number(o.customer_lng);
    if (!lat || !lng) continue;
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cur = counts.get(key) || { lat, lng, n: 0, name: String(o.restaurant_name || "Zone") };
    cur.n += 1;
    counts.set(key, cur);
  }
  if (!counts.size && restaurants.length) {
    return restaurants.slice(0, 5).map((r, i) => ({
      id: `hot_${i}`,
      lat: Number(r.latitude) || 0,
      lng: Number(r.longitude) || 0,
      level: "medium" as const,
      label: "Restaurant hub",
      orders_per_hour: 2,
    })).filter((h) => h.lat && h.lng);
  }
  return [...counts.entries()].map(([id, v]) => ({
    id,
    lat: v.lat,
    lng: v.lng,
    level: v.n >= 5 ? "high" : v.n >= 2 ? "medium" : "low",
    label: v.n >= 5 ? "High demand" : v.n >= 2 ? "Medium demand" : "Low demand",
    orders_per_hour: v.n * 4,
  }));
}

function buildRoutes(
  driverPos: { lat: number; lng: number } | null,
  orders: Array<Record<string, unknown>>
): RoutePolyline[] {
  const routes: RoutePolyline[] = [];
  for (const o of orders) {
    const rest = o.restaurants as { latitude?: number; longitude?: number } | undefined;
    const rLat = Number(o.restaurant_lat ?? rest?.latitude);
    const rLng = Number(o.restaurant_lng ?? rest?.longitude);
    const cLat = Number(o.customer_lat);
    const cLng = Number(o.customer_lng);
    if (!rLat || !rLng || !cLat || !cLng) continue;
    const start = driverPos || { lat: rLat, lng: rLng };
    routes.push({
      id: `${o.order_id}-pickup`,
      kind: "pickup",
      color: "#D49A36",
      points: [[start.lat, start.lng], [rLat, rLng]],
    });
    routes.push({
      id: `${o.order_id}-delivery`,
      kind: "delivery",
      color: "#C2533B",
      points: [[rLat, rLng], [cLat, cLng]],
    });
  }
  return routes;
}

function buildKitchenTimeline(status: string) {
  const steps = ["Order Received", "Cooking", "Packaging", "Ready", "Driver Arrived", "Picked Up", "Delivered"];
  const idx = {
    placed: 0, confirmed: 0, accepted: 1, preparing: 2, ready: 3,
    assigned_internal: 3, picked_up: 5, delivered: 6,
  }[status] ?? 0;
  return steps.map((step, i) => ({ step, done: i <= idx }));
}

async function enrichOrdersWithRestaurantCoords(
  db: SupabaseClient,
  orders: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const ids = [...new Set(orders.map((o) => o.restaurant_id).filter(Boolean))] as string[];
  if (!ids.length) return orders;
  const { data: rests } = await db.from("restaurants").select("restaurant_id,latitude,longitude,name").in("restaurant_id", ids);
  const map = Object.fromEntries((rests || []).map((r) => [r.restaurant_id, r]));
  return orders.map((o) => {
    const r = map[String(o.restaurant_id)];
    return {
      ...o,
      restaurant_lat: o.restaurant_lat ?? r?.latitude,
      restaurant_lng: o.restaurant_lng ?? r?.longitude,
      restaurant_name: o.restaurant_name ?? r?.name,
    };
  });
}

export async function buildDriverLogisticsView(db: SupabaseClient, userId: string): Promise<DriverLogisticsView> {
  const { data: driver } = await db.from("drivers").select("*").eq("user_id", userId).maybeSingle();
  const driverId = driver?.driver_id as string | undefined;

  const [{ data: activeOrders }, { data: recentOrders }] = await Promise.all([
    driverId
      ? db.from("orders").select("*").eq("driver_id", driverId).in("status", ["assigned_internal", "picked_up", "out_for_delivery", "ready"]).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    db.from("orders").select("*").eq("delivery_partner_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);

  const orders = await enrichOrdersWithRestaurantCoords(
    db,
    activeOrders?.length
      ? activeOrders
      : (recentOrders || []).filter((o) => ACTIVE_ORDER_STATUSES.includes(String(o.status))).slice(0, 5)
  );
  const position = driver?.latitude && driver?.longitude
    ? { lat: Number(driver.latitude), lng: Number(driver.longitude) }
    : null;

  const status = deriveDriverStatus(driver, orders || []);
  let remainingKm = 0;
  let etaMin = 0;
  const queue: DeliveryQueueItem[] = [];

  for (const o of orders || []) {
    const rLat = Number(o.restaurant_lat);
    const rLng = Number(o.restaurant_lng);
    const cLat = Number(o.customer_lat);
    const cLng = Number(o.customer_lng);
    const dist = position && cLat && cLng ? haversineKm(position, { lat: cLat, lng: cLng }) : 0;
    const legEta = position && cLat && cLng ? etaMinutesBetween(position, { lat: cLat, lng: cLng }) : 25;
    remainingKm += dist;
    etaMin += legEta;
    queue.push({
      order_id: String(o.order_id),
      restaurant_name: String(o.restaurant_name || "Restaurant"),
      customer_name: String(o.customer_name || "Customer"),
      address: String(o.address || ""),
      distance_km: Math.round(dist * 10) / 10,
      estimated_pay: 8.5,
      estimated_tip: Math.round(Number(o.total || 0) * 0.15 * 100) / 100,
      eta_min: Math.round(legEta),
      priority: status === "delivering" ? 1 : 2,
      prep_status: String(o.status),
      order_age_min: orderAgeMin(String(o.created_at)),
      status: String(o.status),
      restaurant_lat: rLat || undefined,
      restaurant_lng: rLng || undefined,
      customer_lat: cLat || undefined,
      customer_lng: cLng || undefined,
    });
  }

  const delivered = (recentOrders || []).filter((o) => o.status === "delivered");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayDelivered = delivered.filter((o) => new Date(String(o.created_at)) >= todayStart);
  const earnings: DriverEarningsPanel = {
    today: todayDelivered.reduce((s, o) => s + 8.5 + Number(o.total || 0) * 0.05, 0),
    week: delivered.slice(0, 20).reduce((s) => s + 8.5, 0),
    tips: todayDelivered.reduce((s, o) => s + Number(o.total || 0) * 0.12, 0),
    bonuses: 0,
    mileage: Math.round(remainingKm * 10) / 10,
    deliveries_completed: todayDelivered.length,
    acceptance_rate: 94,
    completion_rate: 98,
    online_minutes: driver?.availability ? 120 : 0,
    effective_hourly: todayDelivered.length ? Math.round((todayDelivered.length * 12) / 2) : 0,
  };

  const performance: DriverPerformancePanel = {
    customer_rating: 4.8,
    safety_score: 96,
    on_time_pct: 91,
    avg_delivery_min: 24,
    avg_wait_min: 8,
    total_miles: Math.round(delivered.length * 4.2),
    current_streak: Math.min(7, todayDelivered.length),
  };

  const markers: LogisticsMarker[] = [];
  const activeMode = (driver?.active_delivery_mode as string) || "car";
  if (position) {
    markers.push({
      id: "driver",
      type: "driver",
      lat: position.lat,
      lng: position.lng,
      label: "You",
      meta: { delivery_mode: activeMode, icon: MODE_MAP_ICONS[activeMode] || "🚗" },
    });
  }
  for (const q of queue) {
    if (q.restaurant_lat && q.restaurant_lng) {
      markers.push({ id: `r-${q.order_id}`, type: "restaurant", lat: q.restaurant_lat, lng: q.restaurant_lng, label: q.restaurant_name });
    }
    if (q.customer_lat && q.customer_lng) {
      markers.push({ id: `c-${q.order_id}`, type: "customer", lat: q.customer_lat, lng: q.customer_lng, label: q.customer_name });
    }
  }

  const { data: demandOrders } = await db.from("orders").select("customer_lat,customer_lng,restaurant_name,created_at").gte("created_at", new Date(Date.now() - 3600000).toISOString()).limit(100);
  const hotspots = buildHotspots(demandOrders || [], []);

  const dispatch = await Promise.all(
    (orders || []).slice(0, 3).map((o) => buildDispatchExplain(db, o, o.driver_id as string | undefined))
  );

  return {
    status,
    position,
    speed_kmh: 0,
    remaining_distance_km: Math.round(remainingKm * 10) / 10,
    eta_min: Math.round(etaMin),
    active_delivery_mode: activeMode,
    markers,
    routes: buildRoutes(position, orders || []),
    queue,
    hotspots,
    earnings,
    performance,
    dispatch,
    updated_at: new Date().toISOString(),
  };
}

export async function buildRestaurantLogisticsView(db: SupabaseClient, userId: string): Promise<RestaurantLogisticsView | null> {
  const { data: rest } = await db.from("restaurants").select("*").eq("owner_id", userId).limit(1).maybeSingle();
  if (!rest) return null;

  const { data: orders } = await db
    .from("orders")
    .select("*")
    .eq("restaurant_id", rest.restaurant_id)
    .in("status", ACTIVE_ORDER_STATUSES)
    .order("created_at", { ascending: false })
    .limit(30);

  const active_orders: RestaurantActiveOrder[] = [];
  const markers: LogisticsMarker[] = [{
    id: rest.restaurant_id,
    type: "restaurant",
    lat: Number(rest.latitude),
    lng: Number(rest.longitude),
    label: rest.name,
  }];
  const arrivals: RestaurantLogisticsView["arrivals"] = [];

  for (const o of orders || []) {
    let driverLat: number | undefined;
    let driverLng: number | undefined;
    let driverName = "Unassigned";
    let driverMode = "car";
    if (o.driver_id) {
      const { data: drv } = await db.from("drivers").select("latitude,longitude,user_id,active_delivery_mode").eq("driver_id", o.driver_id).maybeSingle();
      if (drv?.latitude) {
        driverLat = Number(drv.latitude);
        driverLng = Number(drv.longitude);
        driverMode = (drv.active_delivery_mode as string) || "car";
        markers.push({
          id: `d-${o.order_id}`,
          type: "driver",
          lat: driverLat,
          lng: driverLng!,
          label: "Driver",
          meta: { delivery_mode: driverMode, icon: MODE_MAP_ICONS[driverMode] || "🚗" },
        });
      }
      if (drv?.user_id) {
        const { data: u } = await db.from("users").select("name").eq("user_id", drv.user_id).maybeSingle();
        driverName = String(u?.name || "Driver");
      }
    }
    const age = orderAgeMin(String(o.created_at));
    const etaPickup = driverLat && rest.latitude
      ? Math.round(etaMinutesBetween({ lat: driverLat, lng: driverLng! }, { lat: Number(rest.latitude), lng: Number(rest.longitude) }))
      : undefined;
    if (etaPickup != null && etaPickup <= 3) {
      arrivals.push({ order_id: String(o.order_id), message: `Driver ${etaPickup} min away`, severity: "info" });
    }
    if (o.status === "ready" && age > 15) {
      arrivals.push({ order_id: String(o.order_id), message: "Driver delayed — food waiting", severity: "warning" });
    }
    active_orders.push({
      order_id: String(o.order_id),
      customer_name: String(o.customer_name || "Customer"),
      driver_name: driverName,
      driver_id: o.driver_id as string,
      order_value: Number(o.total || 0),
      status: String(o.status),
      live_status: String(o.status).replace(/_/g, " "),
      prep_timer_min: age,
      eta_pickup_min: etaPickup,
      eta_delivery_min: etaPickup != null ? etaPickup + 12 : undefined,
      delay_warning: age > 20 ? "Prep running long" : undefined,
      driver_lat: driverLat,
      driver_lng: driverLng,
      driver_rating: 4.7,
      vehicle_type: driverMode,
      timeline: buildKitchenTimeline(String(o.status)),
      customer_lat: Number(o.customer_lat) || undefined,
      customer_lng: Number(o.customer_lng) || undefined,
    });
    if (o.customer_lat && o.customer_lng) {
      markers.push({
        id: `c-${o.order_id}`,
        type: "customer",
        lat: Number(o.customer_lat),
        lng: Number(o.customer_lng),
        label: String(o.customer_name),
      });
    }
  }

  const { data: hist } = await db.from("orders").select("total,status,created_at,customer_id,customer_lat,customer_lng").eq("restaurant_id", rest.restaurant_id).order("created_at", { ascending: false }).limit(200);
  const paid = (hist || []).filter((o) => o.status === "delivered");
  const now = Date.now();
  const dayMs = 86400000;
  const performance: RestaurantPerformancePanel = {
    avg_prep_min: 14,
    late_orders: (orders || []).filter((o) => orderAgeMin(String(o.created_at)) > 25).length,
    avg_pickup_min: 6,
    avg_delivery_min: 28,
    repeat_customers: new Set(paid.map((o) => o.customer_id)).size,
    daily_revenue: paid.filter((o) => now - new Date(String(o.created_at)).getTime() < dayMs).reduce((s, o) => s + Number(o.total || 0), 0),
    weekly_revenue: paid.filter((o) => now - new Date(String(o.created_at)).getTime() < dayMs * 7).reduce((s, o) => s + Number(o.total || 0), 0),
    monthly_revenue: paid.reduce((s, o) => s + Number(o.total || 0), 0),
  };

  const heatmap_zones = buildHotspots(
    (hist || []).filter((o) => o.customer_lat && o.customer_lng).slice(0, 50),
    [rest]
  );

  const insights = [
    performance.avg_prep_min > 15 ? "Average prep time is increasing — consider staffing up at peak." : "Prep times are on target.",
    performance.daily_revenue > 0 ? `Today's revenue: $${performance.daily_revenue.toFixed(0)}` : "Lunch demand building — stay ready.",
    "Friday evening may require one additional cook based on recent volume.",
  ];

  const routes: RoutePolyline[] = [];
  for (const o of active_orders) {
    if (o.driver_lat && o.driver_lng && rest.latitude) {
      routes.push({
        id: `route-${o.order_id}`,
        kind: "full",
        color: "#43614B",
        points: [
          [o.driver_lat, o.driver_lng],
          [Number(rest.latitude), Number(rest.longitude)],
          ...(o.customer_lat && o.customer_lng ? [[o.customer_lat, o.customer_lng] as [number, number]] : []),
        ],
      });
    }
  }

  return {
    restaurant: {
      restaurant_id: rest.restaurant_id,
      name: rest.name,
      lat: Number(rest.latitude),
      lng: Number(rest.longitude),
    },
    markers,
    routes,
    active_orders,
    arrivals,
    performance,
    heatmap_zones,
    insights,
    updated_at: new Date().toISOString(),
  };
}

export async function buildAdminLogisticsView(db: SupabaseClient): Promise<AdminLogisticsView> {
  const [{ data: drivers }, { data: orders }, { data: restaurants }] = await Promise.all([
    db.from("drivers").select("driver_id,latitude,longitude,availability,workload,active_delivery_mode").eq("availability", true),
    db.from("orders").select("order_id,status,customer_lat,customer_lng,restaurant_id").in("status", ACTIVE_ORDER_STATUSES),
    db.from("restaurants").select("restaurant_id,name,latitude,longitude,accepting_orders").eq("accepting_orders", true).limit(50),
  ]);

  const markers: LogisticsMarker[] = [];
  for (const d of drivers || []) {
    if (d.latitude && d.longitude) {
      const mode = (d.active_delivery_mode as string) || "car";
      markers.push({
        id: d.driver_id,
        type: "driver",
        lat: Number(d.latitude),
        lng: Number(d.longitude),
        label: "Driver",
        meta: { delivery_mode: mode, icon: MODE_MAP_ICONS[mode] || "🚗" },
      });
    }
  }
  for (const r of restaurants || []) {
    if (r.latitude && r.longitude) {
      markers.push({ id: r.restaurant_id, type: "restaurant", lat: Number(r.latitude), lng: Number(r.longitude), label: r.name });
    }
  }

  const busyDrivers = (drivers || []).filter((d) => Number(d.workload) > 0).length;
  const online = (drivers || []).length;

  return {
    drivers_online: online,
    active_orders: (orders || []).length,
    restaurants_active: (restaurants || []).length,
    markers,
    avg_wait_min: 11,
    driver_utilization_pct: online ? Math.round((busyDrivers / online) * 100) : 0,
    bottlenecks: (orders || []).length > online * 2 ? ["Driver supply below demand in active zones"] : [],
    updated_at: new Date().toISOString(),
  };
}
