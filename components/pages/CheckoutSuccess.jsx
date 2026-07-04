"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { safeGet } from "@/lib/api";
import Header from "@/components/Header";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { sanitizeOrder, sanitizeOrders } from "@/lib/safeData";

const DEFAULT_STATUS = { payment_status: "pending", status: "open" };

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState(sessionId ? "polling" : "error");
  const [order, setOrder] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > 8) {
        setStatus("timeout");
        return;
      }

      const session = await safeGet(`/checkout/status/${sessionId}`, DEFAULT_STATUS);
      if (cancelled) return;

      if (!session) {
        setTimeout(poll, 2000);
        return;
      }

      const paymentStatus = session?.payment_status ?? "pending";
      const stripePaymentStatus = session?.stripe_payment_status ?? null;
      const sessionStatus = session?.status ?? "open";

      if (paymentStatus === "paid" || stripePaymentStatus === "paid") {
        setStatus("paid");
        const orders = await safeGet("/orders/my", []);
        const list = sanitizeOrders(orders);
        const match = list.find((o) => o.stripe_session_id === sessionId) || list[0];
        if (!cancelled) setOrder(match ? sanitizeOrder(match) : null);
        return;
      }

      if (sessionStatus === "expired") {
        setStatus("expired");
        return;
      }

      setTimeout(poll, 2000);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        {status === "polling" && (
          <>
            <Loader2 size={48} className="mx-auto animate-spin" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">Confirming your payment…</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>This usually takes a few seconds.</p>
          </>
        )}
        {status === "paid" && (
          <>
            <CheckCircle2 size={56} className="mx-auto" style={{ color: "var(--accent)" }} />
            <h1 className="font-display text-4xl font-black mt-4" data-testid="payment-success">Order placed!</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              We&apos;ve notified the kitchen. Track your order in real time.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <button
                type="button"
                className="btn-primary"
                onClick={() => router.push(order?.order_id ? `/orders/${order.order_id}` : "/orders")}
                data-testid="track-order-btn"
              >
                Track order
              </button>
              <button type="button" className="btn-secondary" onClick={() => router.push("/")}>Keep browsing</button>
            </div>
          </>
        )}
        {(status === "error" || status === "expired" || status === "timeout") && (
          <>
            <XCircle size={56} className="mx-auto" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">Something went wrong</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>Please try again or contact support.</p>
            <button type="button" className="btn-primary mt-6" onClick={() => router.push("/cart")}>Back to cart</button>
          </>
        )}
      </div>
    </div>
  );
}
