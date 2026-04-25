import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState("polling");
  const [order, setOrder] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      if (attempts > 8) { setStatus("timeout"); return; }
      try {
        const r = await api.get(`/checkout/status/${sessionId}`);
        if (r.data.payment_status === "paid") {
          setStatus("paid");
          // Try to find latest order
          const my = await api.get("/orders/my");
          setOrder(my.data[0] || null);
          return;
        }
        if (r.data.status === "expired") { setStatus("expired"); return; }
        setTimeout(poll, 2000);
      } catch {
        setTimeout(poll, 2000);
      }
    };
    poll();
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
              We've notified the kitchen. Track your order in real time.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <button className="btn-primary" onClick={() => navigate(`/orders/${order?.order_id || ""}`)} data-testid="track-order-btn">
                Track order
              </button>
              <button className="btn-secondary" onClick={() => navigate("/")}>Keep browsing</button>
            </div>
          </>
        )}
        {(status === "error" || status === "expired" || status === "timeout") && (
          <>
            <XCircle size={56} className="mx-auto" style={{ color: "var(--primary)" }} />
            <h1 className="font-display text-3xl font-black mt-4">Something went wrong</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>Please try again or contact support.</p>
            <button className="btn-primary mt-6" onClick={() => navigate("/cart")}>Back to cart</button>
          </>
        )}
      </div>
    </div>
  );
}
