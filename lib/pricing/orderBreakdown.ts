import type { SupabaseClient } from "@supabase/supabase-js";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type BreakdownLine = {
  label: string;
  amount: number;
  negative?: boolean;
  highlight?: boolean;
};

export type CustomerOrderBreakdown = {
  items: Array<{ name: string; quantity: number; unit_price: number; line_total: number }>;
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  service_fee: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  lines: BreakdownLine[];
};

export type DriverOrderBreakdown = {
  base_pay: number;
  distance_pay: number;
  bonuses: number;
  tip: number;
  total_earnings: number;
  lines: BreakdownLine[];
};

export type RestaurantOrderBreakdown = {
  gross_sales: number;
  commission: number;
  commission_percent: number | null;
  net_payout: number;
  lines: BreakdownLine[];
};

export type OrderPricingBreakdown = {
  order_id: string;
  customer?: CustomerOrderBreakdown;
  driver?: DriverOrderBreakdown;
  restaurant?: RestaurantOrderBreakdown;
};

type OrderRow = Record<string, unknown>;
type SnapshotRow = {
  subtotal?: number;
  tax_amount?: number;
  delivery_fee?: number;
  service_fee?: number;
  small_order_fee?: number;
  distance_fee?: number;
  surge_fee?: number;
  weather_fee?: number;
  discount_amount?: number;
  tip_amount?: number;
  customer_total?: number;
  rule_snapshot?: Record<string, unknown>;
};

function parseItems(order: OrderRow) {
  const raw = order.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => {
    const row = it as Record<string, unknown>;
    const qty = Number(row.quantity ?? 1);
    const price = Number(row.price ?? 0);
    return {
      name: String(row.name ?? "Item"),
      quantity: qty,
      unit_price: round2(price),
      line_total: round2(price * qty),
    };
  });
}

function combinedDeliveryFee(snapshot: SnapshotRow) {
  return round2(
    Number(snapshot.delivery_fee ?? 0) +
      Number(snapshot.small_order_fee ?? 0) +
      Number(snapshot.distance_fee ?? 0) +
      Number(snapshot.surge_fee ?? 0) +
      Number(snapshot.weather_fee ?? 0)
  );
}

export function buildCustomerBreakdownFromSnapshot(
  order: OrderRow,
  snapshot: SnapshotRow | null
): CustomerOrderBreakdown {
  const items = parseItems(order);
  const subtotal = round2(
    snapshot?.subtotal != null ? Number(snapshot.subtotal) : items.reduce((s, i) => s + i.line_total, 0)
  );
  const tax = round2(Number(snapshot?.tax_amount ?? order.tax_amount ?? 0));
  const delivery = snapshot ? combinedDeliveryFee(snapshot) : round2(Number(order.delivery_fee ?? 0));
  const service = round2(Number(snapshot?.service_fee ?? order.service_fee ?? 0));
  const discount = round2(Number(snapshot?.discount_amount ?? order.discount_amount ?? 0));
  const tip = round2(Number(snapshot?.tip_amount ?? order.tip_amount ?? 0));
  const total = round2(
    Number(snapshot?.customer_total ?? order.total ?? subtotal + tax + delivery + service - discount + tip)
  );

  const lines: BreakdownLine[] = [
    { label: "Items", amount: subtotal },
    ...(tax > 0 ? [{ label: "Taxes", amount: tax }] : []),
    ...(delivery > 0 ? [{ label: "Delivery fee", amount: delivery }] : []),
    ...(service > 0 ? [{ label: "Service fee", amount: service }] : []),
    ...(discount > 0 ? [{ label: "Discounts", amount: discount, negative: true }] : []),
    ...(tip > 0 ? [{ label: "Tip", amount: tip }] : []),
    { label: "Final total", amount: total, highlight: true },
  ];

  return { items, subtotal, tax_amount: tax, delivery_fee: delivery, service_fee: service, discount_amount: discount, tip_amount: tip, total, lines };
}

export function buildCustomerBreakdownFromQuote(
  quote: {
    customer?: {
      subtotal?: number;
      tax_amount?: number;
      delivery_fee?: number;
      service_fee?: number;
      small_order_fee?: number;
      distance_fee?: number;
      surge_fee?: number;
      weather_fee?: number;
      discount_amount?: number;
      tip_amount?: number;
      customer_total?: number;
    };
  },
  items: Array<{ name: string; quantity: number; price: number }>
): CustomerOrderBreakdown {
  const c = quote.customer || {};
  const parsedItems = items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    unit_price: round2(it.price),
    line_total: round2(it.price * it.quantity),
  }));
  const snapshotLike: SnapshotRow = {
    subtotal: c.subtotal,
    tax_amount: c.tax_amount,
    delivery_fee: c.delivery_fee,
    service_fee: c.service_fee,
    small_order_fee: c.small_order_fee,
    distance_fee: c.distance_fee,
    surge_fee: c.surge_fee,
    weather_fee: c.weather_fee,
    discount_amount: c.discount_amount,
    tip_amount: c.tip_amount,
    customer_total: c.customer_total,
  };
  return buildCustomerBreakdownFromSnapshot({ items: parsedItems }, snapshotLike);
}

export function buildDriverBreakdown(row: Record<string, number | null | undefined>): DriverOrderBreakdown {
  const base = round2(Number(row.base_pay ?? 0));
  const distance = round2(
    Number(row.mileage_pay ?? 0) + Number(row.time_pay ?? 0) + Number(row.wait_pay ?? 0)
  );
  const bonuses = round2(
    Number(row.peak_bonus ?? 0) +
      Number(row.long_distance_bonus ?? 0) +
      Number(row.large_order_bonus ?? 0) +
      Number(row.weather_bonus ?? 0) +
      Number(row.bonus_pay ?? 0) +
      Number(row.guaranteed_top_up ?? 0)
  );
  const tip = round2(Number(row.customer_tip ?? 0));
  const total = round2(Number(row.final_driver_pay ?? base + distance + bonuses + tip));

  const lines: BreakdownLine[] = [
    ...(base > 0 ? [{ label: "Base pay", amount: base }] : []),
    ...(distance > 0 ? [{ label: "Distance pay", amount: distance }] : []),
    ...(bonuses > 0 ? [{ label: "Bonuses", amount: bonuses, highlight: true }] : []),
    ...(tip > 0 ? [{ label: "Tip", amount: tip, highlight: true }] : []),
    { label: "Total earnings", amount: total, highlight: true },
  ];

  return { base_pay: base, distance_pay: distance, bonuses, tip, total_earnings: total, lines };
}

export function buildRestaurantBreakdown(row: Record<string, number | string | null | undefined>): RestaurantOrderBreakdown {
  const gross = round2(Number(row.gross_sales ?? 0));
  const commission = round2(Number(row.commission_amount ?? 0));
  const pct = row.commission_percent != null ? Number(row.commission_percent) : null;
  const net = round2(Number(row.net_payout ?? gross - commission));

  const lines: BreakdownLine[] = [
    { label: "Gross sales", amount: gross },
    { label: pct != null ? `Commission (${pct}%)` : "Commission", amount: commission, negative: true },
    { label: "Net payout", amount: net, highlight: true },
  ];

  return { gross_sales: gross, commission, commission_percent: pct, net_payout: net, lines };
}

export async function getOrderPricingBreakdown(
  db: SupabaseClient,
  orderId: string,
  viewer: { user_id: string; role?: string },
  opts: { include?: Array<"customer" | "driver" | "restaurant"> } = {}
): Promise<OrderPricingBreakdown | null> {
  const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order) return null;

  const isAdmin = viewer.role === "admin";
  const isCustomer = order.customer_id === viewer.user_id;
  let isDriver = order.delivery_partner_id === viewer.user_id;
  if (!isDriver && order.driver_id) {
    const { data: drv } = await db.from("drivers").select("user_id").eq("driver_id", order.driver_id).maybeSingle();
    isDriver = drv?.user_id === viewer.user_id;
  }

  let isVendor = false;
  if (order.restaurant_id) {
    const { data: rest } = await db
      .from("restaurants")
      .select("owner_id")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();
    isVendor = rest?.owner_id === viewer.user_id;
  }

  const want = opts.include || [];
  const showCustomer = isAdmin || isCustomer || (want.includes("customer") && isCustomer);
  const showDriver = isAdmin || isDriver || (want.includes("driver") && isDriver);
  const showRestaurant = isAdmin || isVendor || (want.includes("restaurant") && isVendor);

  if (!showCustomer && !showDriver && !showRestaurant) return null;

  const [{ data: snapshot }, { data: driverLedger }, { data: settlement }] = await Promise.all([
    db.from("pricing_snapshots").select("*").eq("order_id", orderId).maybeSingle(),
    db.from("driver_earnings").select("*").eq("order_id", orderId).maybeSingle(),
    db.from("restaurant_settlements").select("*").eq("order_id", orderId).maybeSingle(),
  ]);

  const result: OrderPricingBreakdown = { order_id: orderId };

  if (showCustomer) {
    result.customer = buildCustomerBreakdownFromSnapshot(order, snapshot);
  }

  if (showDriver) {
    if (driverLedger) {
      result.driver = buildDriverBreakdown(driverLedger);
    } else {
      const snapDriver = (snapshot?.rule_snapshot as { driver?: Record<string, number> })?.driver;
      if (snapDriver) result.driver = buildDriverBreakdown(snapDriver);
    }
  }

  if (showRestaurant) {
    if (settlement) {
      result.restaurant = buildRestaurantBreakdown(settlement);
    } else {
      const snapRest = (snapshot?.rule_snapshot as { restaurant?: Record<string, number> })?.restaurant;
      if (snapRest) result.restaurant = buildRestaurantBreakdown(snapRest);
    }
  }

  return result;
}
