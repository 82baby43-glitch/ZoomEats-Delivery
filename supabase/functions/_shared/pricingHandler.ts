/**
 * Pricing API + admin control center routes.
 * Returns null when path is not a pricing route (delegated handler pattern).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  calculateOrderPricing,
  getCachedPricingRules,
  haversineMiles,
  invalidatePricingRulesCache,
  logPricingAudit,
  persistOrderFinancials,
  recommendPricingAdjustments,
  roundMoney,
  type MarketplaceConditions,
  type OrderPricingResult,
} from "./pricing/index.ts";

type Ctx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  user: Record<string, unknown> | null;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

function conditionsFromBody(body: Record<string, unknown>): MarketplaceConditions {
  return {
    distanceMiles: body.distance_miles != null ? Number(body.distance_miles) : undefined,
    estimatedTravelMinutes:
      body.estimated_travel_minutes != null ? Number(body.estimated_travel_minutes) : undefined,
    restaurantPrepMinutes:
      body.restaurant_prep_minutes != null ? Number(body.restaurant_prep_minutes) : undefined,
    waitMinutes: body.wait_minutes != null ? Number(body.wait_minutes) : undefined,
    trafficDelayMinutes:
      body.traffic_delay_minutes != null ? Number(body.traffic_delay_minutes) : undefined,
    trafficMultiplier: body.traffic_multiplier != null ? Number(body.traffic_multiplier) : undefined,
    weatherActive: body.weather_active === true || body.weather_active === "true",
    demandLevel: (body.demand_level as MarketplaceConditions["demandLevel"]) || undefined,
    surgeMultiplier: body.surge_multiplier != null ? Number(body.surge_multiplier) : undefined,
    tipAmount: body.tip_amount != null ? Number(body.tip_amount) : undefined,
    promoCode: (body.promo_code as string) || null,
    discountAmount: body.discount_amount != null ? Number(body.discount_amount) : undefined,
    membershipPlan: (body.membership_plan as MarketplaceConditions["membershipPlan"]) || undefined,
    driverTier: (body.driver_tier as MarketplaceConditions["driverTier"]) || undefined,
    restaurantTier: (body.restaurant_tier as MarketplaceConditions["restaurantTier"]) || undefined,
    multiPickupCount: body.multi_pickup_count != null ? Number(body.multi_pickup_count) : undefined,
    consecutiveDeliveryStreak:
      body.consecutive_delivery_streak != null
        ? Number(body.consecutive_delivery_streak)
        : undefined,
  };
}

export async function estimateDistanceForOrder(
  db: SupabaseClient,
  opts: {
    restaurantId: string;
    customerLat?: number | null;
    customerLng?: number | null;
  }
): Promise<{ distanceMiles: number; prepMinutes: number }> {
  const { data: rest } = await db
    .from("restaurants")
    .select("latitude,longitude,delivery_time_min")
    .eq("restaurant_id", opts.restaurantId)
    .maybeSingle();

  const prepMinutes = Number(rest?.delivery_time_min) || 25;
  if (
    rest?.latitude == null ||
    rest?.longitude == null ||
    opts.customerLat == null ||
    opts.customerLng == null
  ) {
    return { distanceMiles: 3, prepMinutes };
  }
  const miles = haversineMiles(
    Number(rest.latitude),
    Number(rest.longitude),
    Number(opts.customerLat),
    Number(opts.customerLng)
  );
  return { distanceMiles: roundMoney(miles), prepMinutes };
}

export function toPublicPricing(p: OrderPricingResult) {
  return {
    subtotal: p.subtotal,
    tax: p.tax,
    delivery_fee: p.deliveryFee,
    service_fee: p.serviceFee,
    small_order_fee: p.smallOrderFee,
    distance_fee: p.distanceFee,
    surge_fee: p.surgeFee,
    weather_fee: p.weatherFee,
    discounts: p.discounts,
    tip_amount: p.customerTip,
    customer_total: p.customerTotal,
    driver: {
      base_pay: p.baseDriverPay,
      mileage_pay: p.mileagePay,
      time_pay: p.timePay,
      wait_pay: p.waitPay,
      traffic_pay: p.trafficPay,
      bonuses: p.bonuses,
      tip: p.customerTip,
      guaranteed_pay: p.driverGuaranteedPay,
      final_pay: p.finalDriverPay,
    },
    restaurant: {
      commission: p.restaurantCommission,
      payout: p.restaurantPayout,
    },
    platform: {
      stripe_fees: p.stripeFees,
      revenue: p.platformRevenue,
      net_profit: p.netProfit,
    },
    meta: p.meta,
  };
}

export async function buildDriverOfferForOrder(
  db: SupabaseClient,
  order: Record<string, unknown>,
  driverId?: string | null
) {
  const items = (Array.isArray(order.items) ? order.items : []) as Array<{
    item_id: string;
    price: number;
    quantity: number;
    name?: string;
  }>;
  const restaurantId = String(order.restaurant_id || "");
  const geo = await estimateDistanceForOrder(db, {
    restaurantId,
    customerLat: order.customer_lat != null ? Number(order.customer_lat) : null,
    customerLng: order.customer_lng != null ? Number(order.customer_lng) : null,
  });
  const travelMinutes = Math.max(10, Math.round(geo.distanceMiles * 3 + geo.prepMinutes * 0.3));
  const pricing = await calculateOrderPricing(db, {
    restaurantId,
    customerId: order.customer_id ? String(order.customer_id) : null,
    driverId: driverId || (order.driver_id ? String(order.driver_id) : null),
    cartItems: items.length
      ? items
      : [{ item_id: "subtotal", price: Number(order.subtotal) || 0, quantity: 1 }],
    conditions: {
      distanceMiles: geo.distanceMiles,
      estimatedTravelMinutes: travelMinutes,
      restaurantPrepMinutes: geo.prepMinutes,
      waitMinutes: Math.max(0, geo.prepMinutes - 10),
      tipAmount: 0,
      demandLevel: "normal",
    },
  });

  const { data: rest } = await db
    .from("restaurants")
    .select("name,address")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  return {
    order_id: String(order.order_id),
    restaurant_name: rest?.name || String(order.restaurant_name || "Restaurant"),
    restaurant_address: rest?.address || null,
    customer_distance_miles: pricing.meta.distanceMiles,
    estimated_delivery_minutes: travelMinutes,
    guaranteed_earnings: pricing.driverGuaranteedPay,
    tip_estimate: pricing.customerTip,
    bonus_total: pricing.bonuses,
    bonus_breakdown: {
      weather: pricing.weatherBonus,
      peak: pricing.peakBonus,
      large_order: pricing.largeOrderBonus,
      multi_pickup: pricing.multiPickupBonus,
      consecutive: pricing.consecutiveBonus,
      performance: pricing.performanceBonus,
    },
    final_driver_pay: pricing.finalDriverPay,
    pricing: toPublicPricing(pricing),
  };
}

export async function handlePricingRequest(
  db: SupabaseClient,
  ctx: Ctx
): Promise<unknown | null> {
  const { path, method, body } = ctx;

  // ---- Public/customer quote (auth optional but preferred) ----
  if (path === "/pricing/quote" && method === "POST") {
    const restaurantId = String(body.restaurant_id || "");
    const items = (body.items as Array<{ item_id: string; price?: number; quantity: number }>) || [];
    if (!restaurantId) throwErr("restaurant_id required");

    let cartItems: Array<{ item_id: string; name?: string; price: number; quantity: number }> = items.map((i) => ({
      item_id: i.item_id,
      price: Number(i.price) || 0,
      quantity: Math.max(1, Math.min(Number(i.quantity) || 1, 99)),
    }));
    // Prefer server menu prices when item_ids provided
    if (items.length && items.every((i) => i.item_id)) {
      const ids = items.map((i) => i.item_id);
      const { data: menuRows } = await db
        .from("menu_items")
        .select("item_id,name,price")
        .in("item_id", ids)
        .eq("restaurant_id", restaurantId)
        .eq("available", true);
      const canonical = Object.fromEntries((menuRows || []).map((m) => [m.item_id, m]));
      cartItems = items
        .filter((i) => canonical[i.item_id])
        .map((i) => ({
          item_id: i.item_id,
          name: canonical[i.item_id].name,
          price: Number(canonical[i.item_id].price),
          quantity: Math.max(1, Math.min(Number(i.quantity) || 1, 99)),
        }));
    }
    if (!cartItems.length) throwErr("items required");

    const customerId = ctx.user?.user_id ? String(ctx.user.user_id) : null;
    const customerLat = body.customer_lat != null ? Number(body.customer_lat) : null;
    const customerLng = body.customer_lng != null ? Number(body.customer_lng) : null;
    const geo = await estimateDistanceForOrder(db, {
      restaurantId,
      customerLat,
      customerLng,
    });
    const conditions = conditionsFromBody(body);
    if (conditions.distanceMiles == null) conditions.distanceMiles = geo.distanceMiles;
    if (conditions.restaurantPrepMinutes == null) {
      conditions.restaurantPrepMinutes = geo.prepMinutes;
    }
    if (conditions.estimatedTravelMinutes == null) {
      conditions.estimatedTravelMinutes = Math.max(
        10,
        Math.round((conditions.distanceMiles || 3) * 3 + geo.prepMinutes * 0.3)
      );
    }

    const pricing = await calculateOrderPricing(db, {
      restaurantId,
      customerId,
      driverId: body.driver_id ? String(body.driver_id) : null,
      cartItems,
      conditions,
    });
    return toPublicPricing(pricing);
  }

  // ---- Driver offer quote before accept ----
  const offerMatch = path.match(/^\/pricing\/driver-offer\/([^/]+)$/);
  if (offerMatch && method === "GET") {
    const u = ctx.requireRole("delivery", "admin");
    const orderId = offerMatch[1];
    const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
    if (!order) throwErr("Order not found", 404);
    const { data: driver } = await db
      .from("drivers")
      .select("driver_id")
      .eq("user_id", u.user_id)
      .maybeSingle();
    return buildDriverOfferForOrder(db, order, driver?.driver_id || null);
  }

  // Enrich available list with offers
  if (path === "/pricing/driver-offers" && method === "GET") {
    const u = ctx.requireRole("delivery", "admin");
    const { data: driver } = await db
      .from("drivers")
      .select("driver_id")
      .eq("user_id", u.user_id)
      .maybeSingle();
    const { data: orders } = await db
      .from("orders")
      .select("*")
      .eq("status", "ready")
      .is("delivery_partner_id", null)
      .order("created_at", { ascending: false })
      .limit(25);
    const offers = [];
    for (const o of orders || []) {
      offers.push(await buildDriverOfferForOrder(db, o, driver?.driver_id || null));
    }
    return offers;
  }

  // ---- Admin pricing control center ----
  if (path === "/admin/pricing/rules" && method === "GET") {
    ctx.requireRole("admin");
    invalidatePricingRulesCache();
    const { data, error } = await db
      .from("pricing_rules")
      .select("*")
      .order("rule_type", { ascending: true })
      .order("effective_date", { ascending: false });
    if (error) throwErr(error.message, 500);
    return data || [];
  }

  if (path === "/admin/pricing/rules" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const rule_name = String(body.rule_name || "").trim();
    const rule_type = String(body.rule_type || "").trim();
    if (!rule_name || !rule_type) throwErr("rule_name and rule_type required");

    // Deactivate previous active rule of same type+name to keep history
    await db
      .from("pricing_rules")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("rule_type", rule_type)
      .eq("rule_name", rule_name)
      .eq("active", true);

    const row = {
      rule_name,
      rule_type,
      value: Number(body.value) || 0,
      percentage: body.percentage != null ? Number(body.percentage) : null,
      minimum_amount: body.minimum_amount != null ? Number(body.minimum_amount) : null,
      maximum_amount: body.maximum_amount != null ? Number(body.maximum_amount) : null,
      active: body.active === false ? false : true,
      effective_date: body.effective_date || new Date().toISOString(),
    };
    const { data, error } = await db.from("pricing_rules").insert(row).select().single();
    if (error) throwErr(error.message, 500);
    invalidatePricingRulesCache();
    await logPricingAudit(db, {
      action: "pricing_rule_upsert",
      newValue: data,
      changedBy: String(admin.user_id),
      reason: String(body.reason || "admin_update"),
    });
    return data;
  }

  const rulePatchMatch = path.match(/^\/admin\/pricing\/rules\/([^/]+)$/);
  if (rulePatchMatch && method === "PATCH") {
    const admin = ctx.requireRole("admin");
    const id = rulePatchMatch[1];
    const { data: prev } = await db.from("pricing_rules").select("*").eq("id", id).maybeSingle();
    if (!prev) throwErr("Rule not found", 404);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of [
      "rule_name",
      "value",
      "percentage",
      "minimum_amount",
      "maximum_amount",
      "active",
      "effective_date",
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const { data, error } = await db
      .from("pricing_rules")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throwErr(error.message, 500);
    invalidatePricingRulesCache();
    await logPricingAudit(db, {
      action: "pricing_rule_patch",
      previousValue: prev,
      newValue: data,
      changedBy: String(admin.user_id),
      reason: String(body.reason || "admin_patch"),
    });
    return data;
  }

  if (path === "/admin/pricing/recommendations" && method === "GET") {
    ctx.requireRole("admin");
    const rules = await getCachedPricingRules(db);
    const [{ count: openOrders }, { count: availableDrivers }] = await Promise.all([
      db
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("status", ["ready", "confirmed", "preparing", "accepted"]),
      db
        .from("drivers")
        .select("*", { count: "exact", head: true })
        .eq("availability", true),
    ]);
    const recs = recommendPricingAdjustments(rules, {
      openOrders: openOrders || 0,
      availableDrivers: availableDrivers || 0,
      hourOfDay: new Date().getUTCHours(),
      weatherActive: false,
      trafficMultiplier: 1,
    });
    return { signals: { openOrders, availableDrivers }, recommendations: recs };
  }

  if (path === "/admin/pricing/analytics" && method === "GET") {
    ctx.requireRole("admin");
    const [
      { data: revenueRows },
      { data: earningsRows },
      { data: settlementRows },
      { data: snapshots },
    ] = await Promise.all([
      db.from("platform_revenue").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("driver_earnings").select("*").order("created_at", { ascending: false }).limit(500),
      db
        .from("restaurant_settlements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("pricing_snapshots").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

    const revenues = revenueRows || [];
    const earnings = earningsRows || [];
    const settlements = settlementRows || [];

    const grossRevenue = roundMoney(
      revenues.reduce(
        (s, r) =>
          s +
          Number(r.delivery_revenue || 0) +
          Number(r.service_fee_revenue || 0) +
          Number(r.commission_revenue || 0) +
          Number(r.advertising_revenue || 0) +
          Number(r.subscription_revenue || 0),
        0
      )
    );
    const netProfit = roundMoney(revenues.reduce((s, r) => s + Number(r.net_profit || 0), 0));
    const driverCost = roundMoney(revenues.reduce((s, r) => s + Number(r.driver_cost || 0), 0));
    const promoCost = roundMoney(revenues.reduce((s, r) => s + Number(r.promotion_cost || 0), 0));
    const totalDriverPay = roundMoney(
      earnings.reduce((s, r) => s + Number(r.final_driver_pay || 0), 0)
    );
    const totalMilesProxy = earnings.length; // detailed miles live in snapshots
    const avgDriverEarnings = earnings.length
      ? roundMoney(totalDriverPay / earnings.length)
      : 0;
    const restaurantSales = roundMoney(
      settlements.reduce((s, r) => s + Number(r.gross_sales || 0), 0)
    );
    const restaurantPayouts = roundMoney(
      settlements.reduce((s, r) => s + Number(r.net_payout || 0), 0)
    );

    return {
      platform: {
        gross_revenue: grossRevenue,
        net_profit: netProfit,
        margin_pct: grossRevenue > 0 ? roundMoney((netProfit / grossRevenue) * 100) : 0,
        delivery_costs: driverCost,
        promotion_costs: promoCost,
        order_count: revenues.length,
      },
      driver: {
        average_earnings: avgDriverEarnings,
        total_earnings: totalDriverPay,
        earnings_per_order: avgDriverEarnings,
        earnings_per_mile: totalMilesProxy
          ? roundMoney(totalDriverPay / Math.max(totalMilesProxy, 1))
          : 0,
        bonus_costs: roundMoney(earnings.reduce((s, r) => s + Number(r.bonus_pay || 0), 0)),
        sample_size: earnings.length,
      },
      restaurant: {
        sales_volume: restaurantSales,
        payout_total: restaurantPayouts,
        commission_impact: roundMoney(
          settlements.reduce((s, r) => s + Number(r.commission_amount || 0), 0)
        ),
        sample_size: settlements.length,
      },
      recent_snapshots: snapshots || [],
    };
  }

  if (path === "/admin/pricing/promotions" && method === "GET") {
    ctx.requireRole("admin");
    const { data, error } = await db.from("promotions").select("*").order("created_at", {
      ascending: false,
    });
    if (error) throwErr(error.message, 500);
    return data || [];
  }

  if (path === "/admin/pricing/promotions" && method === "POST") {
    const admin = ctx.requireRole("admin");
    const code = String(body.code || "").trim().toUpperCase();
    if (!code) throwErr("code required");
    const row = {
      code,
      discount_type: String(body.discount_type || "percent"),
      discount_value: Number(body.discount_value) || 0,
      usage_limit: body.usage_limit != null ? Number(body.usage_limit) : null,
      active: body.active === false ? false : true,
      expiration_date: body.expiration_date || null,
      minimum_subtotal: body.minimum_subtotal != null ? Number(body.minimum_subtotal) : null,
    };
    const { data, error } = await db.from("promotions").insert(row).select().single();
    if (error) throwErr(error.message, 500);
    await logPricingAudit(db, {
      action: "promotion_created",
      newValue: data,
      changedBy: String(admin.user_id),
    });
    return data;
  }

  if (path === "/admin/pricing/persist" && method === "POST") {
    ctx.requireRole("admin");
    const orderId = String(body.order_id || "");
    if (!orderId) throwErr("order_id required");
    const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
    if (!order) throwErr("Order not found", 404);
    const items = (Array.isArray(order.items) ? order.items : []) as Array<{
      item_id: string;
      price: number;
      quantity: number;
    }>;
    const geo = await estimateDistanceForOrder(db, {
      restaurantId: order.restaurant_id,
      customerLat: order.customer_lat,
      customerLng: order.customer_lng,
    });
    const pricing = await calculateOrderPricing(db, {
      restaurantId: order.restaurant_id,
      customerId: order.customer_id,
      driverId: order.driver_id,
      cartItems: items.length
        ? items
        : [{ item_id: "subtotal", price: Number(order.subtotal) || 0, quantity: 1 }],
      conditions: {
        distanceMiles: geo.distanceMiles,
        restaurantPrepMinutes: geo.prepMinutes,
        estimatedTravelMinutes: Math.round(geo.distanceMiles * 3 + 15),
      },
    });
    const result = await persistOrderFinancials(db, {
      orderId,
      customerId: order.customer_id,
      restaurantId: order.restaurant_id,
      driverId: order.driver_id,
      pricing,
      changedBy: String(ctx.user?.user_id || "admin"),
      reason: "admin_persist",
    });
    return { pricing: toPublicPricing(pricing), persist: result };
  }

  return null;
}
