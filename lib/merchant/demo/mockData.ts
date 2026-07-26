import type {
  DemoAnalytics,
  DemoMenuItem,
  DemoOrder,
  DemoPayouts,
  DemoRestaurant,
  DemoReview,
  DemoStoreHours,
} from "./types";

const FOOD_IMG =
  "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export const DEMO_RESTAURANT: DemoRestaurant = {
  restaurant_id: "demo_merchant_1",
  name: "Harbor & Hearth Kitchen",
  description: "Farm-to-table comfort food with seasonal specials and local ingredients.",
  cuisine: "American · Comfort Food",
  address: "412 Main St, Columbia, MO 65201",
  phone: "(573) 555-0142",
  rating: 4.8,
  delivery_time_min: 28,
  accepting_orders: true,
  image_url: FOOD_IMG,
};

export function createInitialMenu(): DemoMenuItem[] {
  return [
    {
      item_id: "demo_item_1",
      name: "Smoked Brisket Bowl",
      description: "Slow-smoked brisket, roasted veggies, and house BBQ glaze.",
      price: 14.99,
      category: "Mains",
      image_url: FOOD_IMG,
      available: true,
      sold_out: false,
      paused: false,
    },
    {
      item_id: "demo_item_2",
      name: "Crispy Chicken Sandwich",
      description: "Buttermilk chicken, pickles, and spicy aioli on brioche.",
      price: 12.49,
      category: "Mains",
      image_url: FOOD_IMG,
      available: true,
      sold_out: false,
      paused: false,
    },
    {
      item_id: "demo_item_3",
      name: "Garden Harvest Salad",
      description: "Mixed greens, goat cheese, candied pecans, balsamic.",
      price: 10.99,
      category: "Starters",
      image_url: FOOD_IMG,
      available: true,
      sold_out: false,
      paused: false,
    },
    {
      item_id: "demo_item_4",
      name: "Truffle Parmesan Fries",
      description: "Hand-cut fries with truffle oil and aged parmesan.",
      price: 6.99,
      category: "Sides",
      image_url: FOOD_IMG,
      available: true,
      sold_out: false,
      paused: false,
    },
    {
      item_id: "demo_item_5",
      name: "House Lemonade",
      description: "Fresh-squeezed lemonade with mint.",
      price: 3.49,
      category: "Drinks",
      image_url: FOOD_IMG,
      available: true,
      sold_out: false,
      paused: false,
    },
    {
      item_id: "demo_item_6",
      name: "Chocolate Lava Cake",
      description: "Warm chocolate cake with vanilla bean gelato.",
      price: 7.99,
      category: "Desserts",
      image_url: FOOD_IMG,
      available: true,
      sold_out: false,
      paused: false,
    },
  ];
}

export function createInitialOrders(): DemoOrder[] {
  const now = Date.now();
  return [
    {
      order_id: "demo_ord_1001",
      customer_name: "Jordan M.",
      items: [{ item_id: "demo_item_2", name: "Crispy Chicken Sandwich", price: 12.49, quantity: 2 }],
      subtotal: 24.98,
      total: 29.47,
      status: "preparing",
      created_at: new Date(now - 18 * 60 * 1000).toISOString(),
      address: "218 Elm St, Columbia, MO",
      driver_name: "Alex R.",
      delivery_type: "internal",
    },
    {
      order_id: "demo_ord_1002",
      customer_name: "Taylor S.",
      items: [{ item_id: "demo_item_1", name: "Smoked Brisket Bowl", price: 14.99, quantity: 1 }],
      subtotal: 14.99,
      total: 19.48,
      status: "ready",
      created_at: new Date(now - 32 * 60 * 1000).toISOString(),
      address: "55 Broadway Ave, Columbia, MO",
      driver_name: "Morgan L.",
      delivery_type: "internal",
    },
    {
      order_id: "demo_ord_1003",
      customer_name: "Casey P.",
      items: [
        { item_id: "demo_item_4", name: "Truffle Parmesan Fries", price: 6.99, quantity: 1 },
        { item_id: "demo_item_5", name: "House Lemonade", price: 3.49, quantity: 2 },
      ],
      subtotal: 13.97,
      total: 18.46,
      status: "delivered",
      created_at: new Date(now - 95 * 60 * 1000).toISOString(),
      address: "901 Walnut St, Columbia, MO",
      driver_name: "Riley K.",
      delivery_type: "internal",
    },
  ];
}

export const DEMO_ANALYTICS: DemoAnalytics = {
  sales_today: 842.5,
  sales_week: 5280.25,
  sales_month: 21480.9,
  avg_ticket_size: 24.6,
  completed_orders: 34,
  cancelled_orders: 2,
  avg_prep_time_min: 14,
  satisfaction: 4.8,
  returning_customers_pct: 62,
  order_volume_today: 38,
  orders_by_hour: [0, 0, 0, 0, 0, 1, 2, 4, 6, 8, 10, 12, 14, 11, 9, 8, 10, 14, 16, 12, 8, 5, 2, 1],
  peak_ordering_hour: 18,
  best_selling_items: [
    { name: "Smoked Brisket Bowl", count: 48 },
    { name: "Crispy Chicken Sandwich", count: 41 },
    { name: "Truffle Parmesan Fries", count: 36 },
    { name: "House Lemonade", count: 29 },
  ],
  weekly_revenue: [
    { day: "Mon", amount: 620 },
    { day: "Tue", amount: 710 },
    { day: "Wed", amount: 840 },
    { day: "Thu", amount: 910 },
    { day: "Fri", amount: 1240 },
    { day: "Sat", amount: 1480 },
    { day: "Sun", amount: 980 },
  ],
};

export const DEMO_REVIEWS: DemoReview[] = [
  {
    id: "rev_1",
    customer_name: "Avery L.",
    rating: 5,
    comment: "Food arrived hot and perfectly packaged. The brisket bowl is incredible!",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "rev_2",
    customer_name: "Drew H.",
    rating: 5,
    comment: "Fast delivery and friendly driver updates through ZoomEats Connect.",
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "rev_3",
    customer_name: "Sam W.",
    rating: 4,
    comment: "Great menu variety. Fries were a little soft but still tasty.",
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_STORE_HOURS: DemoStoreHours[] = [
  { day: "Monday", open: "11:00", close: "21:00", closed: false },
  { day: "Tuesday", open: "11:00", close: "21:00", closed: false },
  { day: "Wednesday", open: "11:00", close: "21:00", closed: false },
  { day: "Thursday", open: "11:00", close: "22:00", closed: false },
  { day: "Friday", open: "11:00", close: "23:00", closed: false },
  { day: "Saturday", open: "10:00", close: "23:00", closed: false },
  { day: "Sunday", open: "10:00", close: "20:00", closed: false },
];

export const DEMO_PAYOUTS: DemoPayouts = {
  available: 1842.35,
  pending: 326.8,
  last_payout: 2120.5,
  last_payout_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  next_payout_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  placed: "New Order",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  driver_assigned: "Driver Assigned",
  driver_arrived: "Driver Arrived",
  picked_up: "Picked Up",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Declined",
};
