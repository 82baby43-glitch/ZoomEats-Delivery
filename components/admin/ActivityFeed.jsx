"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Activity, ShoppingBag, UserPlus, Store, Clock } from "lucide-react";
import { timeAgo } from "@/components/admin/utils";
import { sanitizeActivity } from "@/lib/safeData";
import { EmptyState } from "@/components/ui/PageStates";

const TYPE_META = {
  order:      { icon: ShoppingBag, color: "var(--primary)" },
  signup:     { icon: UserPlus,    color: "#7DD3FC" },
  restaurant: { icon: Store,       color: "#FBBF24" },
};

export default function ActivityFeed({ events }) {
  const rows = sanitizeActivity(events);

  return (
    <div className="card p-6 lg:col-span-3" data-testid="activity-feed">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={18} style={{ color: "var(--primary)" }} />
        <h3 className="font-display text-xl font-bold">Live activity</h3>
        <span className="label-eyebrow">last {rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No events yet" description="Platform activity will show up here." />
      ) : (
        <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
          <AnimatePresence initial={false}>
            {rows.map((e) => {
              const meta = TYPE_META[e.type] || TYPE_META.order;
              const Icon = meta.icon;
              return (
                <motion.li
                  key={`${e.type}-${e.id}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{ background: "var(--surface-2)" }}
                  data-testid={`event-${e.type}-${e.id}`}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.color, color: "#0A0A0A" }}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{e.title}</div>
                    <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{e.description}</div>
                  </div>
                  <div className="text-xs whitespace-nowrap flex items-center gap-1" style={{ color: "var(--muted)" }}>
                    <Clock size={12} /> {timeAgo(e.when)}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
