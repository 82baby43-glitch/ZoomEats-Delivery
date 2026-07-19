import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePricingQuote, persistPricingSnapshot } from "./engine";
import type { PricingQuoteInput } from "./types";

type HandlerCtx = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  requireAuth: () => Record<string, unknown>;
  requireRole: (...roles: string[]) => Record<string, unknown>;
};

function throwErr(message: string, status = 400): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

export async function handlePricingRequest(
  db: SupabaseClient,
  ctx: HandlerCtx
): Promise<unknown | null> {
  const { path, method, body } = ctx;

  if (path === "/pricing/quote" && method === "POST") {
    const u = ctx.requireAuth();
    const restaurantId = String(body.restaurant_id || "");
    const items = (body.items as Array<{ item_id: string; quantity: number }>) || [];
    if (!restaurantId) throwErr("restaurant_id required");
    if (!items.length) throwErr("items required");

    const ids = items.map((i) => i.item_id);
    const { data: menuRows } = await db
      .from("menu_items")
      .select("item_id,price")
      .in("item_id", ids)
      .eq("restaurant_id", restaurantId)
      .eq("available", true);
    const priceMap = Object.fromEntries((menuRows || []).map((m) => [m.item_id, Number(m.price)]));
    const subtotal = items.reduce((s, line) => {
      const price = priceMap[line.item_id];
      if (price == null) throwErr(`Unavailable item: ${line.item_id}`);
      return s + price * Math.max(1, Math.min(Number(line.quantity), 99));
    }, 0);

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
      const geo = await geocodeOrderAddress(address, String(u.name || ""));
      if (geo) {
        customerLat = geo.latitude;
        customerLng = geo.longitude;
      }
    }

    const input: PricingQuoteInput = {
      subtotal: Math.round(subtotal * 100) / 100,
      restaurantId,
      customerLat,
      customerLng,
      restaurantLat: rest.latitude != null ? Number(rest.latitude) : null,
      restaurantLng: rest.longitude != null ? Number(rest.longitude) : null,
      tipAmount: body.tip_amount != null ? Number(body.tip_amount) : 0,
      discountAmount: body.discount_amount != null ? Number(body.discount_amount) : 0,
      promoCode: body.promo_code ? String(body.promo_code) : null,
      weatherActive: Boolean(body.weather_active),
    };

    const quote = await calculatePricingQuote(db, input);
    return quote;
  }

  return null;
}

export async function quoteOrderForCheckout(
  db: SupabaseClient,
  params: {
    restaurantId: string;
    subtotal: number;
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

export { calculatePricingQuote, persistPricingSnapshot };
