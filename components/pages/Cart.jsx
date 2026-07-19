"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { api, getApiErrorMessage } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { logClientError } from "@/lib/clientErrorLog";
import Header from "@/components/Header";
import DeliveryFeeCalculator from "@/components/checkout/DeliveryFeeCalculator";
import { Minus, Plus, Trash2, Loader2 } from "lucide-react";
import { buildCustomerBreakdownFromQuote } from "@/lib/pricing/orderBreakdown";
import { CustomerOrderBreakdown } from "@/components/pricing/OrderPricingBreakdown";
import { formatMoney } from "@/lib/safeData";

export default function Cart() {
  const { cart, updateQty, clear, syncItemPrices } = useCart();
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("hand_to_me");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [requirePin, setRequirePin] = useState(false);
  const [allowPhoto, setAllowPhoto] = useState(true);
  const [tipAmount, setTipAmount] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState("");
  const [err, setErr] = useState("");
  const [quoteErr, setQuoteErr] = useState("");
  const router = useRouter();
  const placingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "cancelled") {
      setErr("Payment was cancelled. Your cart is still here — tap Pay when you're ready to try again.");
    }
  }, []);

  const fetchQuote = useCallback(async () => {
    if (!cart.restaurant || cart.items.length === 0) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteErr("");
    try {
      const res = await api.post("/pricing/quote", {
        restaurant_id: cart.restaurant.restaurant_id,
        items: cart.items,
        address: address.trim() || undefined,
        tip_amount: tipAmount ? Number(tipAmount) : 0,
        promo_code: promoCode.trim() || undefined,
      });
      setQuote(res?.data || null);
      if (res?.data?.repriced_items?.length) {
        syncItemPrices(res.data.repriced_items);
      }
      setPromoMsg("");
    } catch (e) {
      setQuote(null);
      setQuoteErr(getApiErrorMessage(e, "Could not load delivery fee estimate."));
    } finally {
      setQuoteLoading(false);
    }
  }, [cart.restaurant, cart.items, address, tipAmount, promoCode, syncItemPrices]);

  useEffect(() => {
    const timer = setTimeout(fetchQuote, 400);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  const validatePromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    try {
      const res = await api.get("/pricing/promotions/validate", { params: { code } });
      const data = res?.data;
      if (data?.valid) {
        setPromoMsg(data.description || "Promo applied");
        fetchQuote();
      } else {
        setPromoMsg(data?.message || "Invalid promo");
      }
    } catch (e) {
      setPromoMsg("Could not validate promo");
    }
  };

  const cartSubtotal = cart.items.reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.quantity || 1),
    0
  );
  const breakdownItems = (quote?.repriced_items?.length ? quote.repriced_items : cart.items).map((it) => ({
    name: it.name,
    quantity: it.quantity,
    price: Number(it.price || 0),
  }));
  const customerBreakdown =
    quote && breakdownItems.length > 0
      ? buildCustomerBreakdownFromQuote(quote, breakdownItems)
      : null;
  const quotedTotal = customerBreakdown?.total ?? quote?.customer?.customer_total;
  const displayTotal = Math.max(Number(quotedTotal) || 0, cartSubtotal);

  const placeOrder = async () => {
    if (placingRef.current || loading) return;
    setErr("");
    if (!user) {
      router.push("/");
      return;
    }
    if (!cart.restaurant || cart.items.length === 0) {
      setErr("Your cart is empty.");
      return;
    }
    if (!address.trim()) {
      setErr("Please enter delivery address.");
      return;
    }
    if (quote?.blocked) {
      setErr(quote.block_reason || "This order cannot be placed right now.");
      return;
    }
    if (cartSubtotal <= 0) {
      setErr("Your cart has no priced items. Remove and re-add items, then try again.");
      return;
    }
    if (quoteLoading) {
      setErr("Please wait while we calculate your total.");
      return;
    }

    placingRef.current = true;
    setLoading(true);
    setCheckoutPhase("creating_order");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !sessionData?.session) {
        throw new Error("Please sign in again to complete checkout.");
      }
      const orderRes = await api.post("/orders", {
        restaurant_id: cart.restaurant.restaurant_id,
        items: cart.items,
        address,
        notes,
        delivery_method: deliveryMethod,
        delivery_instructions: deliveryInstructions,
        require_delivery_pin: deliveryMethod === "hand_to_me" && requirePin,
        allow_photo_confirmation: allowPhoto,
        tip_amount: tipAmount ? Number(tipAmount) : 0,
        promo_code: promoCode.trim() || undefined,
      });
      const order = orderRes?.data;
      if (!order?.order_id) throw new Error("Could not create order — please try again");

      setCheckoutPhase("starting_stripe");
      const checkout = await api.post("/checkout/session", {
        order_id: order.order_id,
        origin_url: typeof window !== "undefined" ? window.location.origin : "",
      });
      if (!checkout?.data?.url) throw new Error("Could not start Stripe checkout — please try again");

      clear();
      if (typeof window !== "undefined") window.location.href = checkout.data.url;
    } catch (e) {
      logClientError("checkout.placeOrder", e, {
        restaurantId: cart.restaurant?.restaurant_id,
        itemCount: cart.items.length,
        phase: checkoutPhase,
      });
      setErr(getApiErrorMessage(e, "Could not place order. Please try again."));
      setLoading(false);
      setCheckoutPhase("");
      placingRef.current = false;
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
                    <div className="text-sm" style={{ color: "var(--muted)" }}>${formatMoney(it.price)}</div>
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
                <label className="label-eyebrow">Delivery preferences</label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="delivery_method" checked={deliveryMethod === "hand_to_me"} onChange={() => setDeliveryMethod("hand_to_me")} />
                    Hand it to Me
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="delivery_method" checked={deliveryMethod === "leave_at_door"} onChange={() => setDeliveryMethod("leave_at_door")} />
                    Leave at Door
                  </label>
                </div>
              </div>
              <div>
                <label className="label-eyebrow">Delivery instructions</label>
                <textarea
                  className="input-field mt-2"
                  rows={2}
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  placeholder="Gate code, building entrance, etc."
                  data-testid="checkout-delivery-instructions"
                />
              </div>
              {deliveryMethod === "hand_to_me" && (
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={requirePin} onChange={(e) => setRequirePin(e.target.checked)} data-testid="checkout-require-pin" />
                  <span>Require delivery PIN at handoff</span>
                </label>
              )}
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="mt-1" checked={allowPhoto} onChange={(e) => setAllowPhoto(e.target.checked)} />
                <span>Allow photo confirmation</span>
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <label className="label-eyebrow">Promo code</label>
                  <input
                    className="input-field mt-2"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="FREEDELIVERY"
                    data-testid="checkout-promo"
                  />
                </div>
                <div className="flex items-end">
                  <button type="button" className="btn-secondary text-sm" onClick={validatePromo}>Apply</button>
                </div>
              </div>
              {promoMsg && <p className="text-xs" style={{ color: "var(--primary)" }}>{promoMsg}</p>}
              <div>
                <label className="label-eyebrow">Tip (optional)</label>
                <input
                  className="input-field mt-2"
                  type="number"
                  min="0"
                  step="0.5"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="checkout-tip"
                />
              </div>
              <div>
                <label className="label-eyebrow">Order notes (optional)</label>
                <textarea
                  className="input-field mt-2"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, utensils, etc."
                  data-testid="checkout-notes"
                />
              </div>
              <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
                {customerBreakdown ? (
                  <CustomerOrderBreakdown breakdown={customerBreakdown} loading={quoteLoading} />
                ) : (
                  <DeliveryFeeCalculator
                    quote={quote}
                    loading={quoteLoading}
                    subtotalFallback={cartSubtotal}
                  />
                )}
              </div>
              {quoteErr && !quoteLoading && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>{quoteErr}</p>
              )}
              {err && <div className="text-sm" style={{ color: "var(--primary)" }}>{err}</div>}
              <button
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
                onClick={placeOrder}
                disabled={loading || quote?.blocked || cartSubtotal <= 0}
                data-testid="checkout-submit-button"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden />
                    {checkoutPhase === "starting_stripe" ? "Starting Stripe…" : "Creating order…"}
                  </>
                ) : quoteLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden />
                    Calculating…
                  </>
                ) : (
                  `Pay $${displayTotal.toFixed(2)} with Stripe`
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
