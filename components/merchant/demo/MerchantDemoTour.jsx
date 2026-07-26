"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { DEMO_TOUR_STEPS } from "@/lib/merchant/demo/tourSteps";

export default function MerchantDemoTour({ active, stepIndex, onStepChange, onClose, onRestart, onNavigateTab }) {
  const [rect, setRect] = useState(null);
  const step = DEMO_TOUR_STEPS[stepIndex];

  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      return;
    }
    onNavigateTab(step.tab);
    const timer = window.setTimeout(() => {
      const el = document.querySelector(step.target);
      if (!el) {
        setRect(null);
        return;
      }
      const bounds = el.getBoundingClientRect();
      setRect({
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      });
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [active, step, onNavigateTab]);

  if (!active || !step) return null;

  const isLast = stepIndex >= DEMO_TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" data-testid="merchant-demo-tour">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      {rect && (
        <div
          className="absolute rounded-xl ring-2 ring-[var(--primary)] pointer-events-none"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      )}
      <div
        className="absolute left-4 right-4 md:left-auto md:right-8 md:w-[360px] card p-5 shadow-2xl"
        style={{ bottom: "7.5rem" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label-eyebrow">Guided walkthrough · {stepIndex + 1}/{DEMO_TOUR_STEPS.length}</div>
            <h3 className="font-display text-lg font-bold mt-1">{step.title}</h3>
          </div>
          <button type="button" className="btn-ghost !p-2" onClick={onClose} aria-label="Skip tour">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>{step.body}</p>
        <div className="flex items-center justify-between gap-2 mt-5">
          <button type="button" className="btn-ghost text-sm inline-flex items-center gap-1" onClick={onRestart}>
            <RotateCcw size={14} /> Restart
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost text-sm inline-flex items-center gap-1"
              disabled={stepIndex === 0}
              onClick={() => onStepChange(stepIndex - 1)}
            >
              <ChevronLeft size={14} /> Back
            </button>
            <button
              type="button"
              className="btn-primary text-sm inline-flex items-center gap-1"
              onClick={() => (isLast ? onClose() : onStepChange(stepIndex + 1))}
            >
              {isLast ? "Finish" : "Next"} {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
