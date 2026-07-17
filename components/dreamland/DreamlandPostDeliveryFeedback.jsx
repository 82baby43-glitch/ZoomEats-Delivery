"use client";

import { useState } from "react";
import { dreamlandFeedback } from "@/lib/api";

const OPTIONS = [
  { rating: 5, label: "😍 Loved it", emoji: "😍" },
  { rating: 4, label: "👍 Good", emoji: "👍" },
  { rating: 3, label: "😐 Average", emoji: "😐" },
  { rating: 2, label: "👎 Not for me", emoji: "👎" },
];

export default function DreamlandPostDeliveryFeedback({ orderId, restaurantId, onDone }) {
  const [submitted, setSubmitted] = useState(false);

  const submit = async (rating) => {
    try {
      await dreamlandFeedback({
        action: "rated",
        rating,
        restaurant_id: restaurantId,
        notes: `order:${orderId}`,
      });
      setSubmitted(true);
      onDone?.();
    } catch {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="card p-4 mt-6 text-sm" data-testid="dreamland-meal-feedback-done">
        Thanks — Dreamland will use this to improve your picks.
      </div>
    );
  }

  return (
    <div className="card p-5 mt-6" data-testid="dreamland-meal-feedback">
      <h3 className="font-display font-bold mb-1">How was your meal?</h3>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>Dreamland learns from your feedback to personalize future picks.</p>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.rating}
            type="button"
            className="btn-ghost !py-3 text-sm"
            onClick={() => submit(opt.rating)}
            data-testid={`dreamland-feedback-${opt.rating}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
