"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { api, getApiErrorMessage } from "@/lib/api";
import Header from "@/components/Header";
import { Minus, Plus, Trash2 } from "lucide-react";

export default function Cart() {
  const { cart, updateQty, subtotal, clear } = useCart();
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [tip, setTip] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function loadQuote() {
      if (!cart.restaurant || cart.items.length === 0) {
        setQuote(null);
        return;
      }
      setQuoting(true);
      try {
        const res = await api.post("/pricing/quote", {
          restaurant_id: cart.restaurant.restaurant_id,
          items: cart.items.map((it) => ({
            item_id: it.item_id,
            quantity: it.quantity,
          })),
          tip_amount: tip === "" ? 0 : Number(tip) || 0,
          promo_code: promoCode || null,
        });
        if (!cancelled) setQuote(res?.data || null);
      } catch {
        if (!cancelled) {
          // Fallback preview if quote endpoint unavailable — engine still prices at order create
          setQuote({
            subtotal,
            delivery_fee: 2.99,
            service_fee: 0,
            tax: 0,
            discounts: 0,
            tip_amount: tip === "" ? 0 : Number(tip) || 0,
            customer_total: Math.round((subtotal + 2.99 + (Number(tip) || 0)) * 100) / 100,
          });
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }
    const t = setTimeout(loadQuote, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cart.restaurant, cart.items, subtotal, tip, promoCode]);

  const placeOrder = async () => {
    setErr("");
    if (!user) {
      router.push("/");
      return;
    }
    if (!cart.restaurant || cart.items.length === 0) return;
    if (!address.trim()) { setErr("Please enter delivery address."); return; }
    setLoading(true);
    try {
      const orderRes = await api.post("/orders", {
        restaurant_id: cart.restaurant.restaurant_id,
        items: cart.items,
        address,
        notes,
        tip_amount: tip === "" ? 0 : Number(tip) || 0,
        promo_code: promoCode || null,
      });
      const order = orderRes?.data;
      if (!order?.order_id) throw new Error("Could not create order — please try again");
      const checkout = await api.post("/checkout/session", {
        order_id: order.order_id,
        origin_url: typeof window !== "undefined" ? window.location.origin : "",
      });
      if (!checkout?.data?.url) throw new Error("Could not start checkout");
      clear();
      if (typeof window !== "undefined") window.location.href = checkout.data.url;
    } catch (e) {
      setErr(getApiErrorMessage(e, "Could not place order"));
      setLoading(false);
    }
  };

  const deliveryFee = quote?.delivery_fee ?? 2.99;
  const serviceFee = quote?.service_fee ?? 0;
  const tax = quote?.tax ?? 0;
  const discounts = quote?.discounts ?? 0;
  const smallOrderFee = quote?.small_order_fee ?? 0;
  const distanceFee = quote?.distance_fee ?? 0;
  const surgeFee = quote?.surge_fee ?? 0;
  const weatherFee = quote?.weather_fee ?? 0;
  const tipAmount = quote?.tip_amount ?? (tip === "" ? 0 : Number(tip) || 0);
  const total = quote?.customer_total ?? subtotal + deliveryFee + tipAmount;

  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-12">
        <h1 className="font-display text-4xl font-black tracking-tighter mb-2">Your cart</h1>
        {cart.restaurant && (
          <p className="mb-8" style={{ color: "var(--muted)" }}>
            From <span className="font-bold" style={{ color: "var(--text)" }}>{cart.restaurant.name}</span>
          </p>
        )}

        {cart.items.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="mb-4">Your cart is empty.</p>
            <button className="btn-primary" onClick={() => router.push("/")} data-testid="empty-cart-browse">
              Browse restaurants
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-3">
              {cart.items.map((it) => (
                <div key={it.item_id} className="card p-4 flex items-center gap-4" data-testid={`cart-line-${it.item_id}`}>
                  <img src={it.image_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
                  <div className="flex-1">
                    <div className="font-bold">{it.name}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>${it.price.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn-ghost !p-2" onClick={() => updateQty(it.item_id, it.quantity - 1)} data-testid={`dec-${it.item_id}`}>
                      <Minus size={16} />
                    </button>
                    <span className="font-bold w-6 text-center">{it.quantity}</span>
                    <button className="btn-ghost !p-2" onClick={() => updateQty(it.item_id, it.quantity + 1)} data-testid={`inc-${it.item_id}`}>
                      <Plus size={16} />
                    </button>
                    <button className="btn-ghost !p-2" onClick={() => updateQty(it.item_id, 0)} data-testid={`remove-${it.item_id}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-6 h-fit space-y-4">
              <h3 className="font-display text-xl font-bold">Checkout</h3>
              <div>
                <label className="label-eyebrow">Delivery address</label>
                <input
                  className="input-field mt-2"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, Apt 4B"
                  data-testid="checkout-address"
                />
              </div>
              <div>
                <label className="label-eyebrow">Notes (optional)</label>
                <textarea
                  className="input-field mt-2"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Leave at door…"
                  data-testid="checkout-notes"
                />
              </div>
              <div>
                <label className="label-eyebrow">Tip for driver</label>
                <input
                  className="input-field mt-2"
                  type="number"
                  min="0"
                  step="0.50"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  placeholder="0.00"
                  data-testid="checkout-tip"
                />
              </div>
              <div>
                <label className="label-eyebrow">Promo code</label>
                <input
                  className="input-field mt-2"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="SAVE10"
                  data-testid="checkout-promo"
                />
              </div>
              <div className="border-t pt-4 space-y-2 text-sm" style={{ borderColor: "var(--border)" }} data-testid="pricing-breakdown">
                <div className="flex justify-between"><span>Subtotal</span><span>${Number(quote?.subtotal ?? subtotal).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>${Number(deliveryFee).toFixed(2)}</span></div>
                {serviceFee > 0 && <div className="flex justify-between"><span>Service fee</span><span>${Number(serviceFee).toFixed(2)}</span></div>}
                {smallOrderFee > 0 && <div className="flex justify-between"><span>Small order fee</span><span>${Number(smallOrderFee).toFixed(2)}</span></div>}
                {distanceFee > 0 && <div className="flex justify-between"><span>Distance fee</span><span>${Number(distanceFee).toFixed(2)}</span></div>}
                {surgeFee > 0 && <div className="flex justify-between"><span>Surge</span><span>${Number(surgeFee).toFixed(2)}</span></div>}
                {weatherFee > 0 && <div className="flex justify-between"><span>Weather</span><span>${Number(weatherFee).toFixed(2)}</span></div>}
                {tax > 0 && <div className="flex justify-between"><span>Tax</span><span>${Number(tax).toFixed(2)}</span></div>}
                {discounts > 0 && <div className="flex justify-between"><span>Discounts</span><span>-${Number(discounts).toFixed(2)}</span></div>}
                {tipAmount > 0 && <div className="flex justify-between"><span>Driver tip</span><span>${Number(tipAmount).toFixed(2)}</span></div>}
                <div className="flex justify-between font-display font-bold text-lg pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  <span>Total{quoting ? "…" : ""}</span><span>${Number(total).toFixed(2)}</span>
                </div>
              </div>
              {err && <div className="text-sm" style={{ color: "var(--primary)" }}>{err}</div>}
              <button
                className="btn-primary w-full"
                onClick={placeOrder}
                disabled={loading}
                data-testid="checkout-submit-button"
              >
                {loading ? "Redirecting…" : "Pay with Stripe"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
