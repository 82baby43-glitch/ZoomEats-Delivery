"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const deliveryFee = 2.99;
  const total = subtotal + deliveryFee;

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
      });
      const order = orderRes?.data;
      if (!order?.order_id) throw new Error("Invalid order response");
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
              <div className="border-t pt-4 space-y-2 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>${deliveryFee.toFixed(2)}</span></div>
                <div className="flex justify-between font-display font-bold text-lg pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  <span>Total</span><span>${total.toFixed(2)}</span>
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
