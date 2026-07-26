export type DemoOrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "driver_assigned"
  | "driver_arrived"
  | "picked_up"
  | "delivered"
  | "completed"
  | "cancelled";

export type DemoMenuItem = {
  item_id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  available: boolean;
  sold_out: boolean;
  paused: boolean;
};

export type DemoOrderItem = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
};

export type DemoOrder = {
  order_id: string;
  customer_name: string;
  items: DemoOrderItem[];
  subtotal: number;
  total: number;
  status: DemoOrderStatus;
  created_at: string;
  address: string;
  driver_name?: string;
  delivery_type?: string;
};

export type DemoReview = {
  id: string;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type DemoLogisticsEvent = {
  id: string;
  order_id: string;
  label: string;
  detail: string;
  at: string;
  demo: boolean;
};

export type DemoStoreHours = {
  day: string;
  open: string;
  close: string;
  closed: boolean;
};

export type DemoAnalytics = {
  sales_today: number;
  sales_week: number;
  sales_month: number;
  avg_ticket_size: number;
  completed_orders: number;
  cancelled_orders: number;
  avg_prep_time_min: number;
  satisfaction: number;
  returning_customers_pct: number;
  order_volume_today: number;
  orders_by_hour: number[];
  peak_ordering_hour: number;
  best_selling_items: { name: string; count: number }[];
  weekly_revenue: { day: string; amount: number }[];
};

export type DemoRestaurant = {
  restaurant_id: string;
  name: string;
  description: string;
  cuisine: string;
  address: string;
  phone: string;
  rating: number;
  delivery_time_min: number;
  accepting_orders: boolean;
  image_url: string;
};

export type DemoPayouts = {
  available: number;
  pending: number;
  last_payout: number;
  last_payout_date: string;
  next_payout_date: string;
};
