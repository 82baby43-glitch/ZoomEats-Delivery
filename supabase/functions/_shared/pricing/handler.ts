import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePricingQuote, persistPricingSnapshot } from "./engine.ts";
import { formatCustomerPricingLines, summarizeDeliveryCalculator } from "./customer.ts";
import type { PricingQuoteInput } from "./types.ts";

type HandlerCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  params?: Record<string, string>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

type CartLineInput = { item_id: string; quantity: number; price?: number; name?: string };

export type ResolvedCartLine = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
};

export async function resolveCartLineItems(
  db: SupabaseClient,
  restaurantId: string,
  items: CartLineInput[]
): Promise<{ subtotal: number; items: ResolvedCartLine[] }> {
  if (!items.length) throwErr("items or subtotal required");
  const ids = items.map((i) => i.item_id);
  const { data: menuRows } = await db
    .from("menu_items")
    .select("item_id,name,price")
    .in("item_id", ids)
    .eq("restaurant_id", restaurantId)
    .eq("available", true);
  const menuById = Object.fromEntries((menuRows || []).map((m) => [m.item_id, m]));

  const repriced = items.map((line) => {
    const qty = Math.max(1, Math.min(Number(line.quantity), 99));
    const menu = menuById[line.item_id];
    const menuPrice = menu != null ? Number(menu.price) : NaN;
    const cartPrice = Number(line.price);
    const price =
      Number.isFinite(menuPrice) && menuPrice > 0
        ? menuPrice
        : Number.isFinite(cartPrice) && cartPrice > 0
          ? cartPrice
          : NaN;
    if (!Number.isFinite(price)) throwErr(`Unavailable item: ${line.item_id}`);
    return {
      item_id: line.item_id,
      name: String(menu?.name || line.name || "Item"),
      price: Math.round(price * 100) / 100,
      quantity: qty,
    };
  });

  const subtotal = Math.round(repriced.reduce((s, it) => s + it.price * it.quantity, 0) * 100) / 100;
  return { subtotal, items: repriced };
}

async function buildQuoteInput(
  db: SupabaseClient,
  body: Record<string, unknown>,
  user?: Record<string, unknown>
): Promise<{ input: PricingQuoteInput; repricedItems: ResolvedCartLine[] }> {
  const restaurantId = String(body.restaurant_id || "");
  const items = (body.items as CartLineInput[]) || [];
  if (!restaurantId) throwErr("restaurant_id required");

  let subtotal = body.subtotal != null ? Number(body.subtotal) : NaN;
  let repricedItems: ResolvedCartLine[] = [];
  if (!Number.isFinite(subtotal)) {
    const resolved = await resolveCartLineItems(db, restaurantId, items);
    subtotal = resolved.subtotal;
    repricedItems = resolved.items;
  } else if (items.length) {
    const resolved = await resolveCartLineItems(db, restaurantId, items);
    repricedItems = resolved.items;
  }

  const { data: rest } = await db
    .from("restaurants")
    .select("latitude,longitude")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!rest) throwErr("Restaurant not found", 404);

  let customerLat = body.customer_lat != null ? Number(body.customer_lat) : null;
  let customerLng = body.customer_lng != null ? Number(body.customer_lng) : null;
  const address = String(body.address || "").trim();
  if ((customerLat == null || customerLng == null) && address) {
    const { geocodeOrderAddress } = await import("../geocodeAdmin.ts");
    const geo = await geocodeOrderAddress(address, String(user?.name || ""));
    if (geo) {
      customerLat = geo.latitude;
      customerLng = geo.longitude;
    }
  }

  return {
    input: {
      subtotal: Math.round(subtotal * 100) / 100,
      restaurantId,
      customerId: user?.user_id ? String(user.user_id) : null,
      customerLat,
      customerLng,
      restaurantLat: rest.latitude != null ? Number(rest.latitude) : null,
      restaurantLng: rest.longitude != null ? Number(rest.longitude) : null,
      tipAmount: body.tip_amount != null ? Number(body.tip_amount) : 0,
      discountAmount: body.discount_amount != null ? Number(body.discount_amount) : 0,
      promoCode: body.promo_code ? String(body.promo_code) : null,
      weatherActive: Boolean(body.weather_active),
      allowSubsidy: true,
    },
    repricedItems,
  };
}

export async function handlePricingRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body } = ctx;

  if (path === "/pricing/delivery-estimate" && method === "POST") {
    let user: Record<string, unknown> | undefined;
    try {
      user = ctx.requireAuth();
    } catch {
      user = undefined;
    }
    const { input, repricedItems } = await buildQuoteInput(db, body, user);
    const quote = await calculatePricingQuote(db, input);
    return {
      calculator: quote.delivery_calculator,
      lines: quote.customer_lines,
      customer: quote.customer,
      distance_miles: quote.distance_miles,
      surge_multiplier: quote.surge_multiplier,
      free_delivery: quote.free_delivery,
      repriced_items: repricedItems,
    };
  }

  const promoMatch = path.match(/^\/pricing\/promotions\/validate$/);
  if (promoMatch && method === "GET") {
    const code = String(ctx.params?.code || body.code || "");
    if (!code) throwErr("code required");
    const { data: promo } = await db
      .from("promotions")
      .select("*")
      .ilike("code", code.trim())
      .eq("active", true)
      .maybeSingle();
    if (!promo) return { valid: false, message: "Invalid or expired promo code" };
    if (promo.expiration_date && new Date(String(promo.expiration_date)) < new Date()) {
      return { valid: false, message: "Promo code has expired" };
    }
    if (promo.usage_limit != null && Number(promo.usage_count) >= Number(promo.usage_limit)) {
      return { valid: false, message: "Promo code usage limit reached" };
    }
    return {
      valid: true,
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: Number(promo.discount_value),
      minimum_subtotal: promo.minimum_subtotal != null ? Number(promo.minimum_subtotal) : null,
      description:
        promo.discount_type === "free_delivery"
          ? "Free delivery on this order"
          : promo.discount_type === "percent"
            ? `${promo.discount_value}% off`
            : `$${Number(promo.discount_value).toFixed(2)} off`,
    };
  }

  if (path === "/pricing/quote" && method === "POST") {
    let user: Record<string, unknown> | undefined;
    try {
      user = ctx.requireAuth();
    } catch {
      user = undefined;
    }
    const { input, repricedItems } = await buildQuoteInput(db, body, user);
    const quote = await calculatePricingQuote(db, input);
    return { ...quote, repriced_items: repricedItems };
  }

  return null;
}

export async function quoteOrderForCheckout(
  db: SupabaseClient,
  params: {
    restaurantId: string;
    subtotal: number;
    customerId?: string;
    customerLat?: number | null;
    customerLng?: number | null;
    restaurantLat?: number | null;
    restaurantLng?: number | null;
    tipAmount?: number;
    promoCode?: string | null;
    allowSubsidy?: boolean;
  }
) {
  const quote = await calculatePricingQuote(db, {
    subtotal: params.subtotal,
    restaurantId: params.restaurantId,
    customerId: params.customerId,
    customerLat: params.customerLat,
    customerLng: params.customerLng,
    restaurantLat: params.restaurantLat,
    restaurantLng: params.restaurantLng,
    tipAmount: params.tipAmount,
    promoCode: params.promoCode,
    allowSubsidy: params.allowSubsidy,
  });

  if (quote.blocked) {
    throwErr(quote.block_reason || "Order cannot be priced", 422);
  }

  return quote;
}

export { calculatePricingQuote, persistPricingSnapshot, formatCustomerPricingLines, summarizeDeliveryCalculator };
