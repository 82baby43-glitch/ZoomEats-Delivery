"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/safeData";
import { isPaymentConfirmed } from "@/lib/orderState";

const COLUMNS = [
  { id: "placed", label: "New Orders", statuses: ["placed"] },
  { id: "accepted", label: "Accepted", statuses: ["accepted"] },
  { id: "preparing", label: "Preparing", statuses: ["preparing"] },
  { id: "ready", label: "Ready for Pickup", statuses: ["ready"] },
  { id: "picked_up", label: "Picked Up", statuses: ["picked_up", "out_for_delivery", "assigned_internal"] },
  { id: "delivered", label: "Delivered", statuses: ["delivered"] },
];

const STATUS_FLOW = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "picked_up",
  picked_up: "delivered",
};

export default function KitchenDisplaySystem({ orders, onStatusChange, busy }) {
  const [dragId, setDragId] = useState(null);

  const paidOrders = orders.filter((o) => isPaymentConfirmed(o) && o.status !== "cancelled");

  const moveOrder = async (order, targetStatus) => {
    if (!targetStatus || order.status === targetStatus) return;
    await onStatusChange(order.order_id, targetStatus);
  };

  const onDrop = async (e, targetStatus) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData("orderId");
    const order = paidOrders.find((o) => o.order_id === orderId);
    if (order) await moveOrder(order, targetStatus);
    setDragId(null);
  };

  return (
    <div className="overflow-x-auto pb-4 -mx-2 px-2">
      <div className="flex gap-4 min-w-max">
        {COLUMNS.map((col) => {
          const colOrders = paidOrders.filter((o) => col.statuses.includes(o.status));
          return (
            <div
              key={col.id}
              className="w-72 flex-shrink-0 rounded-2xl p-3"
              style={{ background: "var(--surface-2)" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, col.statuses[0])}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">{col.label}</h3>
                <span className="badge">{colOrders.length}</span>
              </div>
              <div className="space-y-3 min-h-[120px]">
                {colOrders.map((order) => (
                  <div
                    key={order.order_id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("orderId", order.order_id);
                      setDragId(order.order_id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className="card p-3 cursor-grab active:cursor-grabbing transition-opacity"
                    style={{ opacity: dragId === order.order_id ? 0.5 : 1 }}
                  >
                    <div className="font-bold text-sm">{order.customer_name}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      #{String(order.order_id).slice(-6).toUpperCase()} · ${formatMoney(order.total)}
                    </div>
                    <div className="text-xs mt-2">
                      {(order.items || []).slice(0, 3).map((it, i) => (
                        <div key={i}>{it.quantity}× {it.name}</div>
                      ))}
                    </div>
                    {order.special_instructions && (
                      <div className="text-xs mt-2 italic" style={{ color: "var(--warning)" }}>
                        {order.special_instructions}
                      </div>
                    )}
                    {STATUS_FLOW[order.status] && (
                      <button
                        type="button"
                        className="btn-primary w-full mt-3 !py-1.5 text-xs"
                        disabled={busy === order.order_id}
                        onClick={() => moveOrder(order, STATUS_FLOW[order.status])}
                      >
                        → {COLUMNS.find((c) => c.statuses.includes(STATUS_FLOW[order.status]))?.label || STATUS_FLOW[order.status]}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
