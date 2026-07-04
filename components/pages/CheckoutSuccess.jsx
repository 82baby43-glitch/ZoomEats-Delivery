"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, safeGet } from "@/lib/api";
import Header from "@/components/Header";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { OrderState, PAYMENT_STATE_LABEL } from "@/lib/orderState";
import { sanitizeOrder, sanitizeOrders } from "@/lib/safeData";
import { logClientError } from "@/lib/clientErrorLog";

const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 5000];

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState("initializing");
  const [order, setOrder] = useState(null);
  const router = useRouter();
  const [verifyTick, setVerifyTick] = useState(0);
  const hasVerifiedRef = useRef(false);

  useEffect(() => {
    hasVerifiedRef.current = false;
  }, [verifyTick]);

  useEffect(() => {
    const id = params.get("session_id");
    setSessionId(id);
    if (!id) setStatus("invalid_session");
  }, [params]);

  useEffect(() => {
    if (!sessionId) return;
    if (hasVerifiedRef.current) return;
    hasVerifiedRef.current = true;
    setStatus("polling");

    let cancelled = false;

    const verifyOnce = async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        try {
          // Ask server to verify with Stripe and sync — webhook fallback
          const confirm = await api.post(`/checkout/confirm/${sessionId}`);
          if (cancelled) return;

          if (confirm.data?.payment_status === "paid" || confirm.data?.confirmed) {
            setStatus("paid");
            const orders = await safeGet("/orders/my", []);
            const list = sanitizeOrders(orders);
            const match = list.find((o) => o.stripe_session_id === sessionId) || list[0];
            if (!cancelled) setOrder(match ? sanitizeOrder(match) : null);
            return;
          }

          const checkoutData = await safeGet(`/checkout/status/${sessionId}`, {
            payment_status: "processing",
            status: "open",
          });
          if (cancelled) return;

          if (checkoutData?.payment_status === "paid" || checkoutData?.cached) {
            setStatus("paid");
            const orders = await safeGet("/orders/my", []);
            const list = sanitizeOrders(orders);
            if (!cancelled) setOrder(list[0] ? sanitizeOrder(list[0]) : null);
            return;
          }

          if (checkoutData?.status === "expired" || checkoutData?.stripe_payment_status === "unpaid") {
            setStatus("expired");
            return;
          }

          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          }
        } catch (e) {
          logClientError("checkout.success", e, { sessionId, attempt });
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          }
        }
      }
      if (!cancelled) setStatus("processing");
    };

    verifyOnce();
    return () => {
      cancelled = true;
    };
  }, [sessionId, verifyTick]);

  const retryVerify = () => {
    setVerifyTick((t) => t + 1);
  };

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        {(status === "initializing" || status === "polling") && (
          <>
            <Loader2 size={48} className="mx-auto animate-spin" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">
              {status === "polling" ? "Confirming your payment…" : "Loading…"}
            </h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              {PAYMENT_STATE_LABEL[OrderState.PROCESSING_PAYMENT]}
            </p>
          </>
        )}
        {status === "processing" && (
          <>
            <Loader2 size={48} className="mx-auto animate-spin" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">Processing payment…</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Payment received — waiting for confirmation. This usually completes in a few seconds.
            </p>
            <button type="button" className="btn-secondary mt-6" onClick={retryVerify}>
              Check again
            </button>
          </>
        )}
        {status === "invalid_session" && (
          <>
            <XCircle size={56} className="mx-auto" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">Invalid session</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              No checkout session was found. Please return to your cart and try again.
            </p>
            <button type="button" className="btn-primary mt-6" onClick={() => router.push("/cart")}>
              Back to cart
            </button>
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
              <button type="button" className="btn-secondary" onClick={() => router.push("/")}>
                Keep browsing
              </button>
            </div>
          </>
        )}
        {(status === "expired" || status === "timeout") && (
          <>
            <XCircle size={56} className="mx-auto" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">Payment not completed</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Your payment may have expired or failed. Please try again or contact support.
            </p>
            <button type="button" className="btn-primary mt-6" onClick={() => router.push("/cart")}>
              Back to cart
            </button>
          </>
        )}
      </div>
    </div>
  );
}
