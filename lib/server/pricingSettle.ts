/**
 * On payment success: recompute + persist immutable financial ledgers.
 * Safe to call multiple times (unique order_id constraints).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateOrderPricing, persistOrderFinancials } from "../pricing";
import { estimateDistanceForOrder } from "./pricingHandler";

export async function settlePaidOrderFinancials(
  db: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    const { data: order } = await db.from("orders").select("*").eq("order_id", orderId).maybeSingle();
    if (!order) return;

    const items = (Array.isArray(order.items) ? order.items : []) as Array<{
      item_id: string;
      price: number;
      quantity: number;
      name?: string;
    }>;
    const geo = await estimateDistanceForOrder(db, {
      restaurantId: String(order.restaurant_id || ""),
      customerLat: order.customer_lat != null ? Number(order.customer_lat) : null,
      customerLng: order.customer_lng != null ? Number(order.customer_lng) : null,
    });

    const pricing = await calculateOrderPricing(db, {
      restaurantId: String(order.restaurant_id || ""),
      customerId: order.customer_id ? String(order.customer_id) : null,
      driverId: order.driver_id ? String(order.driver_id) : null,
      cartItems: items.length
        ? items
        : [{ item_id: "subtotal", price: Number(order.subtotal) || 0, quantity: 1 }],
      conditions: {
        distanceMiles: geo.distanceMiles,
        restaurantPrepMinutes: geo.prepMinutes,
        estimatedTravelMinutes: Math.max(
          10,
          Math.round(geo.distanceMiles * 3 + geo.prepMinutes * 0.3)
        ),
        waitMinutes: Math.max(0, geo.prepMinutes - 10),
      },
    });

    await persistOrderFinancials(db, {
      orderId,
      customerId: order.customer_id ? String(order.customer_id) : null,
      restaurantId: order.restaurant_id ? String(order.restaurant_id) : null,
      driverId: order.driver_id ? String(order.driver_id) : null,
      pricing,
      changedBy: "stripe_webhook",
      reason: "payment_confirmed",
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        pricing_settle_error: e instanceof Error ? e.message : String(e),
        order_id: orderId,
      })
    );
  }
}
