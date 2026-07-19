type CheckoutOrder = {
  order_id: string;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  customer_name?: string | null;
  subtotal?: number | null;
  delivery_fee?: number | null;
  service_fee?: number | null;
  tax_amount?: number | null;
  tip_amount?: number | null;
  discount_amount?: number | null;
  small_order_fee?: number | null;
  total: number;
};

type CheckoutUser = {
  user_id: string;
  email?: string | null;
  name?: string | null;
};

export function buildStripeCheckoutSessionBody(
  order: CheckoutOrder,
  user: CheckoutUser,
  originUrl: string
): URLSearchParams {
  const totalCents = Math.round(Number(order.total) * 100);
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `ZoomEats — ${order.restaurant_name || "Order"}`,
    "line_items[0][price_data][product_data][description]": `Order ${order.order_id}`,
    "line_items[0][price_data][unit_amount]": String(totalCents),
    "line_items[0][quantity]": "1",
    success_url: `${originUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${originUrl}/cart?payment=cancelled&order_id=${encodeURIComponent(order.order_id)}`,
    "metadata[order_id]": order.order_id,
    "metadata[user_id]": user.user_id,
    "metadata[restaurant_id]": order.restaurant_id || "",
    "metadata[restaurant_name]": order.restaurant_name || "",
    "metadata[customer_name]": order.customer_name || user.name || "",
    "metadata[subtotal]": String(order.subtotal ?? 0),
    "metadata[delivery_fee]": String(order.delivery_fee ?? 0),
    "metadata[service_fee]": String(order.service_fee ?? 0),
    "metadata[tax_amount]": String(order.tax_amount ?? 0),
    "metadata[tip_amount]": String(order.tip_amount ?? 0),
    "metadata[discount_amount]": String(order.discount_amount ?? 0),
    "metadata[small_order_fee]": String(order.small_order_fee ?? 0),
    "metadata[total]": String(order.total),
    "payment_intent_data[metadata][order_id]": order.order_id,
    "payment_intent_data[metadata][user_id]": user.user_id,
    "payment_intent_data[metadata][restaurant_id]": order.restaurant_id || "",
  });

  const email = user.email?.trim();
  if (email) params.set("customer_email", email);

  return params;
}

export function assertRestaurantAvailableForCheckout(rest: {
  approved?: boolean | null;
  accepting_orders?: boolean | null;
  active?: boolean | null;
  delivery_enabled?: boolean | null;
  name?: string | null;
}): string | null {
  if (!rest.approved) return "This restaurant is not yet approved for orders.";
  if (rest.accepting_orders === false) return `${rest.name || "This restaurant"} is not accepting orders right now.`;
  if (rest.active === false) return `${rest.name || "This restaurant"} is temporarily unavailable.`;
  if (rest.delivery_enabled === false) return `${rest.name || "This restaurant"} is not offering delivery right now.`;
  return null;
}
