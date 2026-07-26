"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";

export default function IncomingOrderAlertBanner({ alert, onDismiss, onView }) {
  if (!alert) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={alert.orderId}
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -24 }}
        className="fixed inset-x-0 top-0 z-[200] px-4 pt-4 pointer-events-none"
      >
        <button
          type="button"
          onClick={() => onView(alert.orderId)}
          className="w-full max-w-lg mx-auto block pointer-events-auto text-left rounded-2xl p-5 shadow-2xl border-2 transition-transform active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, #141414 0%, #1a1f0a 100%)",
            borderColor: "#C6FF00",
            color: "#F5F5F5",
          }}
          data-testid="incoming-order-alert-banner"
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 animate-pulse"
              style={{ background: "#C6FF0022", color: "#C6FF00" }}
            >
              <Bell size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest font-bold" style={{ color: "#C6FF00" }}>
                {alert.title}
              </div>
              <div className="font-display text-2xl font-black mt-1">{alert.subtitle}</div>
              <div className="text-sm mt-1" style={{ color: "#A3A3A3" }}>{alert.etaLine}</div>
              {alert.customerName && (
                <div className="text-sm mt-2">{alert.customerName}{alert.total != null ? ` · $${Number(alert.total).toFixed(2)}` : ""}</div>
              )}
              <div className="text-xs font-bold mt-3" style={{ color: "#C6FF00" }}>Tap to view order →</div>
            </div>
            <button
              type="button"
              className="btn-ghost !p-2 pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(alert.orderId);
              }}
              aria-label="Dismiss banner"
            >
              <X size={18} />
            </button>
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
