"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Bell,
  Clock,
  DollarSign,
  MapPin,
  Package,
  Play,
  RotateCcw,
  Settings,
  Star,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
  MessageSquare,
  History,
} from "lucide-react";
import Header from "@/components/Header";
import { formatMoney } from "@/lib/safeData";
import { ORDER_STATUS_LABELS } from "@/lib/merchant/demo/mockData";
import { useMerchantDemo } from "@/lib/merchant/demo/useMerchantDemo";
import MerchantDemoBanner from "./MerchantDemoBanner";
import MerchantDemoSignupBar from "./MerchantDemoSignupBar";
import MerchantDemoTour from "./MerchantDemoTour";

const FOOD_IMG =
  "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const TABS = [
  { id: "home", label: "Dashboard", icon: Store },
  { id: "orders", label: "Orders", icon: Package },
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "store", label: "Store", icon: Settings },
  { id: "connect", label: "Connect™", icon: Truck },
  { id: "payouts", label: "Payouts", icon: Wallet },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "history", label: "History", icon: History },
];

const ORDER_ACTIONS = {
  placed: [
    { status: "accepted", label: "Accept Order", primary: true },
    { status: "cancelled", label: "Decline" },
  ],
  accepted: [{ status: "preparing", label: "Start Preparing", primary: true }],
  preparing: [{ status: "ready", label: "Mark Ready for Pickup", primary: true }],
  ready: [],
  driver_assigned: [],
  driver_arrived: [],
  picked_up: [],
  delivered: [{ status: "completed", label: "Mark Completed", primary: true }],
};

function StatusBadge({ status }) {
  const colors = {
    placed: "#fbbf24",
    accepted: "#60a5fa",
    preparing: "#a78bfa",
    ready: "#4ade80",
    driver_assigned: "#22d3ee",
    driver_arrived: "#38bdf8",
    picked_up: "#f472b6",
    delivered: "#4ade80",
    completed: "#86efac",
    cancelled: "#f87171",
  };
  return (
    <span
      className="text-xs font-bold px-2 py-1 rounded-full"
      style={{ background: `${colors[status] || "#94a3b8"}22`, color: colors[status] || "#94a3b8" }}
    >
      {ORDER_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function MerchantDemoDashboard() {
  const demo = useMerchantDemo();
  const [tab, setTab] = useState("home");
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [menuDraft, setMenuDraft] = useState({ name: "", price: "", category: "Mains", description: "" });
  const [imagePreview, setImagePreview] = useState("");

  const stats = useMemo(
    () => ({
      todaySales: demo.analytics.sales_today,
      activeOrders: demo.activeOrders.length,
      rating: demo.restaurant.rating,
      prepMin: demo.analytics.avg_prep_time_min,
    }),
    [demo]
  );

  const maxHour = Math.max(...demo.analytics.orders_by_hour, 1);
  const maxWeek = Math.max(...demo.analytics.weekly_revenue.map((d) => d.amount), 1);

  const saveMenuItem = () => {
    if (!menuDraft.name || !menuDraft.price) return;
    demo.addMenuItem({
      name: menuDraft.name,
      description: menuDraft.description,
      price: parseFloat(menuDraft.price),
      category: menuDraft.category,
      image_url: imagePreview || FOOD_IMG,
      available: true,
      sold_out: false,
      paused: false,
    });
    setMenuDraft({ name: "", price: "", category: "Mains", description: "" });
    setImagePreview("");
  };

  return (
    <div className="min-h-screen pb-28">
      <Header />
      <MerchantDemoBanner />

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="label-eyebrow">Merchant demo</div>
            <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">{demo.restaurant.name}</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{demo.restaurant.cuisine}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={demo.simulateNewOrder} data-testid="demo-simulate-order">
              <Bell size={16} /> Simulate New Order
            </button>
            <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={() => { setTourStep(0); setTourActive(true); }}>
              <Play size={16} /> Start Tour
            </button>
            <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={demo.resetDemo}>
              <RotateCcw size={16} /> Reset Demo
            </button>
            <Link href="/for-merchants" className="btn-ghost">Back to Merchants</Link>
          </div>
        </div>

        <AnimatePresence>
          {demo.incomingAlert && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="card p-4 border-2"
              style={{ borderColor: "var(--primary)" }}
              data-testid="demo-incoming-alert"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-lg">🔔 New order received</div>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {demo.incomingAlert.customer_name} · ${formatMoney(demo.incomingAlert.total)} · #{demo.incomingAlert.order_id.slice(-6)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" onClick={() => { demo.setOrderStatus(demo.incomingAlert.order_id, "accepted"); setTab("orders"); }}>
                    Accept
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => demo.setOrderStatus(demo.incomingAlert.order_id, "cancelled")}>
                    Decline
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`badge whitespace-nowrap inline-flex items-center gap-1.5 ${tab === t.id ? "ring-2 ring-[var(--primary)]" : ""}`}
              onClick={() => setTab(t.id)}
              data-tour={`demo-${t.id}`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === "home" && (
          <div className="space-y-6" data-tour="demo-home">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Today's Sales", value: `$${formatMoney(stats.todaySales)}`, icon: DollarSign },
                { label: "Active Orders", value: stats.activeOrders, icon: Package },
                { label: "Rating", value: stats.rating, icon: Star },
                { label: "Avg Prep", value: `${stats.prepMin}m`, icon: Clock },
              ].map((tile) => (
                <div key={tile.label} className="card p-4">
                  <tile.icon size={16} style={{ color: "var(--primary)" }} />
                  <div className="text-xs mt-2 uppercase" style={{ color: "var(--muted)" }}>{tile.label}</div>
                  <div className="font-display text-2xl font-bold mt-1">{tile.value}</div>
                </div>
              ))}
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card p-5">
                <h3 className="font-bold mb-4">Incoming orders</h3>
                <div className="space-y-3">
                  {demo.activeOrders.slice(0, 4).map((order) => (
                    <div key={order.order_id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-semibold">{order.customer_name}</div>
                        <div style={{ color: "var(--muted)" }}>#{order.order_id.slice(-6)} · ${formatMoney(order.total)}</div>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                  ))}
                  {!demo.activeOrders.length && <p className="text-sm" style={{ color: "var(--muted)" }}>No active orders. Simulate one to get started.</p>}
                </div>
              </div>
              <div className="card p-5">
                <h3 className="font-bold mb-4">Delivery status</h3>
                <div className="space-y-3">
                  {demo.logistics.slice(0, 5).map((event) => (
                    <div key={event.id} className="text-sm">
                      <div className="font-semibold">{event.label}</div>
                      <div style={{ color: "var(--muted)" }}>{event.detail}</div>
                    </div>
                  ))}
                  {!demo.logistics.length && <p className="text-sm" style={{ color: "var(--muted)" }}>Logistics events appear as you manage demo orders.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-4" data-tour="demo-orders">
            {demo.activeOrders.map((order) => (
              <motion.div key={order.order_id} layout className="card p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold">Order #{order.order_id.slice(-6)}</h3>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                      {order.customer_name} · <MapPin size={12} className="inline" /> {order.address}
                    </p>
                    <ul className="mt-3 space-y-1 text-sm">
                      {order.items.map((item) => (
                        <li key={`${order.order_id}-${item.item_id}`}>{item.quantity}× {item.name} · ${formatMoney(item.price)}</li>
                      ))}
                    </ul>
                    {order.driver_name && (
                      <p className="text-sm mt-2 inline-flex items-center gap-1" style={{ color: "var(--muted)" }}>
                        <Truck size={14} /> Driver: {order.driver_name}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(ORDER_ACTIONS[order.status] || []).map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        className={action.primary ? "btn-primary" : "btn-ghost"}
                        onClick={() => demo.setOrderStatus(order.order_id, action.status)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
            {!demo.activeOrders.length && (
              <div className="card p-10 text-center" style={{ color: "var(--muted)" }}>
                No active orders. Click <strong>Simulate New Order</strong> to experience the full workflow.
              </div>
            )}
          </div>
        )}

        {tab === "menu" && (
          <div className="grid lg:grid-cols-3 gap-6" data-tour="demo-menu">
            <div className="card p-5 space-y-3 h-fit">
              <h3 className="font-display text-lg font-bold">Add menu item (demo)</h3>
              <input className="input-field" placeholder="Name" value={menuDraft.name} onChange={(e) => setMenuDraft({ ...menuDraft, name: e.target.value })} />
              <input className="input-field" type="number" step="0.01" placeholder="Price" value={menuDraft.price} onChange={(e) => setMenuDraft({ ...menuDraft, price: e.target.value })} />
              <textarea className="input-field" rows={2} placeholder="Description" value={menuDraft.description} onChange={(e) => setMenuDraft({ ...menuDraft, description: e.target.value })} />
              <select className="input-field" value={menuDraft.category} onChange={(e) => setMenuDraft({ ...menuDraft, category: e.target.value })}>
                {["Starters", "Mains", "Sides", "Desserts", "Drinks"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <label className="text-sm block">
                <span className="font-semibold">Upload image (simulation)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="input-field mt-1"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setImagePreview(URL.createObjectURL(file));
                  }}
                />
              </label>
              {imagePreview && <img src={imagePreview} alt="" className="w-full h-32 object-cover rounded-xl" />}
              <button type="button" className="btn-primary w-full" onClick={saveMenuItem}>Add item</button>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Demo menu edits reset when you reload or click Reset Demo.</p>
            </div>
            <div className="lg:col-span-2 space-y-3">
              {demo.menu.map((item) => (
                <div key={item.item_id} className="card p-4 flex flex-col md:flex-row gap-4">
                  <img src={item.image_url || FOOD_IMG} alt="" className="w-full md:w-24 h-24 rounded-xl object-cover" />
                  <div className="flex-1">
                    <div className="font-bold flex flex-wrap items-center gap-2">
                      {item.name}
                      {item.sold_out && <span className="badge text-[10px]">Sold out</span>}
                      {item.paused && <span className="badge text-[10px]">Paused</span>}
                    </div>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>{item.category} · ${formatMoney(item.price)}</p>
                    <p className="text-sm mt-1">{item.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost text-xs" onClick={() => demo.updateMenuItem(item.item_id, { sold_out: !item.sold_out, available: item.sold_out })}>
                      {item.sold_out ? "Mark available" : "Sold out"}
                    </button>
                    <button type="button" className="btn-ghost text-xs" onClick={() => demo.updateMenuItem(item.item_id, { paused: !item.paused })}>
                      {item.paused ? "Resume" : "Pause"}
                    </button>
                    <button type="button" className="btn-ghost text-xs" onClick={() => demo.updateMenuItem(item.item_id, { price: Math.round((item.price + 1) * 100) / 100 })}>
                      +$1 price
                    </button>
                    <button type="button" className="btn-ghost text-xs" onClick={() => demo.removeMenuItem(item.item_id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-6" data-tour="demo-analytics">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Today", value: `$${formatMoney(demo.analytics.sales_today)}` },
                { label: "This week", value: `$${formatMoney(demo.analytics.sales_week)}` },
                { label: "This month", value: `$${formatMoney(demo.analytics.sales_month)}` },
                { label: "Avg ticket", value: `$${formatMoney(demo.analytics.avg_ticket_size)}` },
              ].map((tile) => (
                <div key={tile.label} className="card p-4">
                  <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>{tile.label}</div>
                  <div className="font-display text-2xl font-bold mt-1">{tile.value}</div>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="card p-4"><div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Satisfaction</div><div className="text-3xl font-bold mt-1">{demo.analytics.satisfaction}/5</div></div>
              <div className="card p-4"><div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Returning customers</div><div className="text-3xl font-bold mt-1">{demo.analytics.returning_customers_pct}%</div></div>
              <div className="card p-4"><div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Order volume today</div><div className="text-3xl font-bold mt-1">{demo.analytics.order_volume_today}</div></div>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card p-5">
                <h3 className="font-bold mb-4">Popular menu items</h3>
                <ul className="space-y-2">
                  {demo.analytics.best_selling_items.map((item) => (
                    <li key={item.name} className="flex justify-between text-sm"><span>{item.name}</span><span style={{ color: "var(--muted)" }}>{item.count} sold</span></li>
                  ))}
                </ul>
              </div>
              <div className="card p-5">
                <h3 className="font-bold mb-4">Revenue by day</h3>
                <div className="flex items-end gap-2 h-32">
                  {demo.analytics.weekly_revenue.map((row) => (
                    <div key={row.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full rounded-t" style={{ height: `${Math.max(8, (row.amount / maxWeek) * 100)}%`, background: "var(--primary)" }} />
                      <span className="text-[10px]" style={{ color: "var(--muted)" }}>{row.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-bold mb-4">Order volume by hour</h3>
              <div className="flex items-end gap-1 h-32">
                {demo.analytics.orders_by_hour.map((count, hour) => (
                  <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t" style={{ height: `${Math.max(4, (count / maxHour) * 100)}%`, background: hour === demo.analytics.peak_ordering_hour ? "var(--primary)" : "var(--border)" }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "store" && (
          <div className="grid lg:grid-cols-2 gap-6" data-tour="demo-store">
            <div className="card p-5 space-y-3">
              <h3 className="font-bold">Store settings</h3>
              <input className="input-field" value={demo.restaurant.name} onChange={(e) => demo.updateRestaurant({ name: e.target.value })} />
              <textarea className="input-field" rows={3} value={demo.restaurant.description} onChange={(e) => demo.updateRestaurant({ description: e.target.value })} />
              <input className="input-field" value={demo.restaurant.phone} onChange={(e) => demo.updateRestaurant({ phone: e.target.value })} />
              <input className="input-field" value={demo.restaurant.address} onChange={(e) => demo.updateRestaurant({ address: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={demo.restaurant.accepting_orders} onChange={(e) => demo.updateRestaurant({ accepting_orders: e.target.checked })} />
                Accepting orders
              </label>
            </div>
            <div className="card p-5">
              <h3 className="font-bold mb-4">Store hours</h3>
              <div className="space-y-2">
                {demo.storeHours.map((row) => (
                  <div key={row.day} className="grid grid-cols-[100px_1fr_1fr_auto] gap-2 items-center text-sm">
                    <span className="font-medium">{row.day}</span>
                    <input className="input-field !py-1.5" type="time" value={row.open} disabled={row.closed} onChange={(e) => demo.updateStoreHour(row.day, { open: e.target.value })} />
                    <input className="input-field !py-1.5" type="time" value={row.close} disabled={row.closed} onChange={(e) => demo.updateStoreHour(row.day, { close: e.target.value })} />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={row.closed} onChange={(e) => demo.updateStoreHour(row.day, { closed: e.target.checked })} />
                      Closed
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "connect" && (
          <div className="space-y-6" data-tour="demo-connect">
            <div className="card p-5 border" style={{ borderColor: "rgba(56, 189, 248, 0.35)" }}>
              <h3 className="font-display text-xl font-bold">ZoomEats Connect™ Logistics Preview</h3>
              <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
                Simulated driver assignment, pickup coordination, and delivery tracking. All events below are demonstrations only.
              </p>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card p-5">
                <h4 className="font-bold mb-4">Live delivery pipeline</h4>
                <div className="space-y-4">
                  {["Driver Assignment", "Live Status Updates", "Pickup Coordination", "Delivery Tracking", "Completion Confirmation"].map((step, i) => (
                    <div key={step} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--primary)", color: "#0A0A0A" }}>{i + 1}</div>
                      <div>
                        <div className="font-semibold">{step}</div>
                        <div className="text-sm" style={{ color: "var(--muted)" }}>Demonstration event — no live drivers dispatched</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-5">
                <h4 className="font-bold mb-4">Recent Connect™ events</h4>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {demo.logistics.map((event) => (
                    <div key={event.id} className="text-sm border-b pb-2" style={{ borderColor: "var(--border)" }}>
                      <div className="font-semibold flex items-center gap-2">
                        <MessageSquare size={14} /> {event.label}
                        <span className="badge text-[10px]">Demo</span>
                      </div>
                      <div style={{ color: "var(--muted)" }}>{event.detail}</div>
                      <div className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>{new Date(event.at).toLocaleTimeString()}</div>
                    </div>
                  ))}
                  {!demo.logistics.length && <p className="text-sm" style={{ color: "var(--muted)" }}>Accept and complete a demo order to see Connect™ in action.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "payouts" && (
          <div className="space-y-6" data-tour="demo-payouts">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="card p-5"><div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Available</div><div className="text-3xl font-bold mt-1">${formatMoney(demo.payouts.available)}</div></div>
              <div className="card p-5"><div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Pending</div><div className="text-3xl font-bold mt-1">${formatMoney(demo.payouts.pending)}</div></div>
              <div className="card p-5"><div className="text-xs uppercase" style={{ color: "var(--muted)" }}>Last payout</div><div className="text-3xl font-bold mt-1">${formatMoney(demo.payouts.last_payout)}</div></div>
            </div>
            <div className="card p-5 text-sm space-y-2" style={{ color: "var(--muted)" }}>
              <p>Last payout: {new Date(demo.payouts.last_payout_date).toLocaleDateString()}</p>
              <p>Next scheduled payout: {new Date(demo.payouts.next_payout_date).toLocaleDateString()}</p>
              <p className="text-xs">Sample payout data for demonstration purposes only.</p>
            </div>
          </div>
        )}

        {tab === "reviews" && (
          <div className="space-y-4">
            {demo.reviews.map((review) => (
              <div key={review.id} className="card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold">{review.customer_name}</div>
                  <div className="badge inline-flex items-center gap-1"><Star size={12} /> {review.rating}</div>
                </div>
                <p className="text-sm mt-2">{review.comment}</p>
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{new Date(review.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {demo.orderHistory.map((order) => (
              <div key={order.order_id} className="card p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">#{order.order_id.slice(-6)} · {order.customer_name}</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>${formatMoney(order.total)} · {new Date(order.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge status={order.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <MerchantDemoSignupBar />
      <MerchantDemoTour
        active={tourActive}
        stepIndex={tourStep}
        onStepChange={setTourStep}
        onClose={() => setTourActive(false)}
        onRestart={() => setTourStep(0)}
        onNavigateTab={setTab}
      />
    </div>
  );
}
