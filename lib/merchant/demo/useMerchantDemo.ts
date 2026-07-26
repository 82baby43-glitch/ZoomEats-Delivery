"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playChime } from "@/lib/chime";
import {
  createInitialMenu,
  createInitialOrders,
  DEMO_ANALYTICS,
  DEMO_PAYOUTS,
  DEMO_RESTAURANT,
  DEMO_REVIEWS,
  DEMO_STORE_HOURS,
} from "./mockData";
import type {
  DemoLogisticsEvent,
  DemoMenuItem,
  DemoOrder,
  DemoOrderStatus,
  DemoStoreHours,
} from "./types";

function cloneMenu() {
  return createInitialMenu().map((item) => ({ ...item }));
}

function cloneOrders() {
  return createInitialOrders().map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item })),
  }));
}

function cloneHours() {
  return DEMO_STORE_HOURS.map((row) => ({ ...row }));
}

function nextOrderId() {
  return `demo_ord_${Date.now().toString(36)}`;
}

function nextItemId() {
  return `demo_item_${Date.now().toString(36)}`;
}

const DRIVER_NAMES = ["Alex R.", "Morgan L.", "Riley K.", "Jamie T.", "Casey D."];

export function useMerchantDemo() {
  const [restaurant, setRestaurant] = useState(DEMO_RESTAURANT);
  const [menu, setMenu] = useState<DemoMenuItem[]>(cloneMenu);
  const [orders, setOrders] = useState<DemoOrder[]>(cloneOrders);
  const [storeHours, setStoreHours] = useState<DemoStoreHours[]>(cloneHours);
  const [logistics, setLogistics] = useState<DemoLogisticsEvent[]>([]);
  const [incomingAlert, setIncomingAlert] = useState<DemoOrder | null>(null);
  const timersRef = useRef<number[]>([]);

  const pushLogistics = useCallback((orderId: string, label: string, detail: string) => {
    setLogistics((prev) => [
      {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        order_id: orderId,
        label,
        detail,
        at: new Date().toISOString(),
        demo: true,
      },
      ...prev,
    ].slice(0, 30));
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const resetDemo = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setRestaurant({ ...DEMO_RESTAURANT });
    setMenu(cloneMenu());
    setOrders(cloneOrders());
    setStoreHours(cloneHours());
    setLogistics([]);
    setIncomingAlert(null);
  }, []);

  const updateOrder = useCallback((orderId: string, patch: Partial<DemoOrder>) => {
    setOrders((prev) => prev.map((o) => (o.order_id === orderId ? { ...o, ...patch } : o)));
  }, []);

  const advanceAfterReady = useCallback(
    (orderId: string, driverName: string) => {
      schedule(() => {
        updateOrder(orderId, { status: "driver_assigned", driver_name: driverName });
        pushLogistics(orderId, "Driver Assigned", `${driverName} accepted the delivery (demo)`);
      }, 2200);

      schedule(() => {
        updateOrder(orderId, { status: "driver_arrived" });
        pushLogistics(orderId, "Driver Arrived", `${driverName} is at your store for pickup (demo)`);
      }, 4800);

      schedule(() => {
        updateOrder(orderId, { status: "picked_up" });
        pushLogistics(orderId, "Picked Up", `${driverName} picked up the order (demo)`);
      }, 7200);

      schedule(() => {
        updateOrder(orderId, { status: "delivered" });
        pushLogistics(orderId, "Delivered", "Order delivered to customer (demo)");
      }, 10500);

      schedule(() => {
        updateOrder(orderId, { status: "completed" });
        pushLogistics(orderId, "Completed", "Order marked complete in merchant dashboard (demo)");
      }, 12800);
    },
    [pushLogistics, schedule, updateOrder]
  );

  const setOrderStatus = useCallback(
    (orderId: string, status: DemoOrderStatus) => {
      if (status === "cancelled") {
        updateOrder(orderId, { status });
        pushLogistics(orderId, "Order Declined", "Merchant declined the order (demo)");
        setIncomingAlert((current) => (current?.order_id === orderId ? null : current));
        return;
      }

      updateOrder(orderId, { status });
      pushLogistics(orderId, "Status Updated", `Order moved to ${status.replace(/_/g, " ")} (demo)`);
      setIncomingAlert((current) => (current?.order_id === orderId ? null : current));

      if (status === "ready") {
        const driver = DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)];
        advanceAfterReady(orderId, driver);
      }
    },
    [advanceAfterReady, pushLogistics, updateOrder]
  );

  const simulateNewOrder = useCallback(() => {
    const available = menu.filter((m) => m.available && !m.sold_out && !m.paused);
    const item = available[Math.floor(Math.random() * available.length)] || menu[0];
    const qty = 1 + Math.floor(Math.random() * 2);
    const subtotal = Math.round(item.price * qty * 100) / 100;
    const total = Math.round((subtotal + 4.99) * 100) / 100;
    const customers = ["Jordan M.", "Taylor S.", "Casey P.", "Riley K.", "Morgan L.", "Alex R."];
    const order: DemoOrder = {
      order_id: nextOrderId(),
      customer_name: customers[Math.floor(Math.random() * customers.length)],
      items: [{ item_id: item.item_id, name: item.name, price: item.price, quantity: qty }],
      subtotal,
      total,
      status: "placed",
      created_at: new Date().toISOString(),
      address: "128 Demo Lane, Columbia, MO",
      delivery_type: "internal",
    };

    setOrders((prev) => [order, ...prev]);
    setIncomingAlert(order);
    pushLogistics(order.order_id, "New Order Received", `${order.customer_name} placed a demo order`);
    playChime();
  }, [menu, pushLogistics]);

  const addMenuItem = useCallback((input: Omit<DemoMenuItem, "item_id">) => {
    const row: DemoMenuItem = { ...input, item_id: nextItemId() };
    setMenu((prev) => [row, ...prev]);
    return row;
  }, []);

  const updateMenuItem = useCallback((itemId: string, patch: Partial<DemoMenuItem>) => {
    setMenu((prev) => prev.map((item) => (item.item_id === itemId ? { ...item, ...patch } : item)));
  }, []);

  const removeMenuItem = useCallback((itemId: string) => {
    setMenu((prev) => prev.filter((item) => item.item_id !== itemId));
  }, []);

  const updateRestaurant = useCallback((patch: Partial<typeof DEMO_RESTAURANT>) => {
    setRestaurant((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateStoreHour = useCallback((day: string, patch: Partial<DemoStoreHours>) => {
    setStoreHours((prev) => prev.map((row) => (row.day === day ? { ...row, ...patch } : row)));
  }, []);

  const activeOrders = orders.filter((o) => !["completed", "cancelled", "delivered"].includes(o.status));
  const orderHistory = orders.filter((o) => ["completed", "cancelled", "delivered"].includes(o.status));

  return {
    restaurant,
    menu,
    orders,
    activeOrders,
    orderHistory,
    storeHours,
    logistics,
    analytics: DEMO_ANALYTICS,
    reviews: DEMO_REVIEWS,
    payouts: DEMO_PAYOUTS,
    incomingAlert,
    dismissIncomingAlert: () => setIncomingAlert(null),
    simulateNewOrder,
    setOrderStatus,
    addMenuItem,
    updateMenuItem,
    removeMenuItem,
    updateRestaurant,
    updateStoreHour,
    resetDemo,
  };
}

export type MerchantDemoState = ReturnType<typeof useMerchantDemo>;
