"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const BENEFITS = [
  "Higher driver pay",
  "Lower fees for restaurants",
  "Reliable deliveries",
  "Better customer support",
];

export default function WhyZoomEatsDisclosure() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="card overflow-hidden shrink-0 w-[min(100vw-3rem,20rem)]"
      data-testid="why-zoomeats-disclosure"
    >
      <button
        type="button"
        className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left hover:bg-black/20 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="why-zoomeats-toggle"
      >
        <span className="font-display font-bold text-sm leading-snug">
          Why <span style={{ color: "var(--primary)" }}>ZOOMEATS</span> is better:
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--muted)" }}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul
            className="px-4 pb-4 pt-1 space-y-2.5 border-t"
            style={{ borderColor: "var(--border)" }}
            data-testid="why-zoomeats-benefits"
          >
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm font-semibold uppercase tracking-wide">
                <Check size={16} className="shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
