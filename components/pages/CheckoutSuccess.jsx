"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, safeGet } from "@/lib/api";
import Header from "@/components/Header";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { sanitizeOrder, sanitizeOrders } from "@/lib/safeData";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000];

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState(sessionId ? "polling" : "error");
  const [order, setOrder] = useState(null);
  const router = useRouter();
  const hasVerifiedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }
    if (hasVerifiedRef.current) return;
    hasVerifiedRef.current = true;

    let cancelled = false;

    const resolveOrder = async (session) => {
      const orderId = session?.order_id ?? null;
      if (orderId) {
        if (!cancelled) setOrder({ order_id: orderId, stripe_session_id: sessionId });
        return;
      }
      const orders = await safeGet("/orders/my", []);
      const list = sanitizeOrders(orders);
      const match = list.find((o) => o.stripe_session_id === sessionId) || list[0];
      if (!cancelled) setOrder(match ? sanitizeOrder(match) : null);
    };

    const verifyOnce = async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        try {
          const r = await api.get(`/checkout/status/${sessionId}`);
          if (cancelled) return;

          const session = r?.data ?? {};
          const paymentStatus = session.payment_status ?? "pending";
          const stripePaymentStatus = session.stripe_payment_status ?? null;
          const sessionStatus = session.status ?? "open";

          if (
            paymentStatus === "paid" ||
            stripePaymentStatus === "paid" ||
            sessionStatus === "complete" ||
            session.cached
          ) {
            setStatus("paid");
            await resolveOrder(session);
            return;
          }

          if (sessionStatus === "expired") {
            setStatus("expired");
            return;
          }

          if (session.rate_limited && attempt < MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
            continue;
          }

          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          }
        } catch {
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          }
        }
      }
      if (!cancelled) setStatus("timeout");
    };

    verifyOnce();
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
              <button className="btn-primary" onClick={() => router.push(`/orders/${order?.order_id || ""}`)} data-testid="track-order-btn">
                Track order
              </button>
              <button className="btn-secondary" onClick={() => router.push("/")}>Keep browsing</button>
            </div>
          </>
        )}
        {(status === "error" || status === "expired" || status === "timeout") && (
          <>
            <XCircle size={56} className="mx-auto" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">Something went wrong</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>Please try again or contact support.</p>
            <button className="btn-primary mt-6" onClick={() => router.push("/cart")}>Back to cart</button>
          </>
        )}
      </div>
    </div>
  );
}
