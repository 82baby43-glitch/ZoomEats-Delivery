export type DemoTourStep = {
  id: string;
  title: string;
  body: string;
  tab: string;
  target: string;
};

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: "overview",
    title: "Dashboard Overview",
    body: "See today's sales, active orders, and store performance at a glance.",
    tab: "home",
    target: "[data-tour='demo-home']",
  },
  {
    id: "orders",
    title: "Incoming Orders",
    body: "Accept, prepare, and complete orders. Try simulating a new order to hear the merchant alert.",
    tab: "orders",
    target: "[data-tour='demo-orders']",
  },
  {
    id: "menu",
    title: "Menu Management",
    body: "Add, edit, pause, or mark items sold out. Demo changes reset automatically.",
    tab: "menu",
    target: "[data-tour='demo-menu']",
  },
  {
    id: "analytics",
    title: "Analytics",
    body: "Track revenue, popular items, prep times, and customer satisfaction.",
    tab: "analytics",
    target: "[data-tour='demo-analytics']",
  },
  {
    id: "store",
    title: "Store Settings",
    body: "Manage hours, contact info, and operational preferences.",
    tab: "store",
    target: "[data-tour='demo-store']",
  },
  {
    id: "connect",
    title: "ZoomEats Connect™",
    body: "Watch how driver assignment, pickup coordination, and delivery tracking work.",
    tab: "connect",
    target: "[data-tour='demo-connect']",
  },
  {
    id: "payouts",
    title: "Payouts",
    body: "Review available balance, pending earnings, and payout schedule.",
    tab: "payouts",
    target: "[data-tour='demo-payouts']",
  },
];
