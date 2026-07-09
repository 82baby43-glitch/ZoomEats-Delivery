"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/safeData";

export default function MoodQuickReorder({ lastWin }) {
  const { addItem, updateQty } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!lastWin?.restaurant?.restaurant_id || !lastWin?.item?.item_id) return null;

  const reorder = () => {
    if (busy) return;
    setBusy(true);
    try {
      const qty = lastWin.item.quantity || 1;
      addItem(
        { restaurant_id: lastWin.restaurant.restaurant_id, name: lastWin.restaurant.name },
        {
          item_id: lastWin.item.item_id,
          name: lastWin.item.name,
          price: lastWin.item.price,
          image_url: lastWin.item.image_url,
        }
      );
      if (qty > 1) updateQty(lastWin.item.item_id, qty);
      router.push("/cart");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-3xl border overflow-hidden"
      style={{
        borderColor: "var(--border)",
        background: "linear-gradient(135deg, rgba(67,97,75,0.08) 0%, rgba(212,154,54,0.06) 100%)",
      }}
      data-testid="mood-quick-reorder-card"
    >
      <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex-1 min-w-0">
          <div className="label-eyebrow">Same vibe, same meal</div>
          <h3 className="font-display text-2xl md:text-3xl font-black tracking-tight mt-1">
            {lastWin.headline}
          </h3>
          <p className="mt-2 text-sm max-w-lg" style={{ color: "var(--muted)" }}>
            {lastWin.subline}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="badge">{lastWin.mood_label}</span>
            <span className="badge">{lastWin.restaurant.name}</span>
            <span className="badge">
              {lastWin.item.name} · ${formatMoney(lastWin.item.price)}
            </span>
          </div>
        </div>

        {lastWin.restaurant.image_url && (
          <div className="w-full md:w-40 h-28 rounded-2xl overflow-hidden shrink-0 border" style={{ borderColor: "var(--border)" }}>
            <img
              src={lastWin.restaurant.image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={reorder}
          disabled={busy}
          data-testid="mood-quick-reorder-button"
        >
          <RotateCcw size={18} />
          {busy ? "Adding…" : "Order again"}
        </button>
      </div>
    </section>
  );
}
