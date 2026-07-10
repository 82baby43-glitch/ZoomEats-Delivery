export type DriverMapStatus =
  | "offline"
  | "online"
  | "available"
  | "en_route"
  | "waiting"
  | "delivering"
  | "break";

export type MapTheme = "dark" | "light";

export type LogisticsMarker = {
  id: string;
  type: "driver" | "restaurant" | "customer" | "hotspot";
  lat: number;
  lng: number;
  label?: string;
  meta?: Record<string, unknown> & {
    heading_deg?: number;
    speed_kmh?: number;
  };
};

export type RoutePolyline = {
  id: string;
  points: Array<[number, number]>;
  kind: "pickup" | "delivery" | "full";
  color?: string;
};

export type DemandHotspot = {
  id: string;
  lat: number;
  lng: number;
  level: "high" | "medium" | "low";
  label: string;
  orders_per_hour?: number;
};

export type DeliveryQueueItem = {
  order_id: string;
  restaurant_name: string;
  customer_name: string;
  address: string;
  distance_km: number;
  estimated_pay: number;
  estimated_tip: number;
  eta_min: number;
  priority: number;
  prep_status: string;
  order_age_min: number;
  status: string;
  restaurant_lat?: number;
  restaurant_lng?: number;
  customer_lat?: number;
  customer_lng?: number;
};

export type DriverEarningsPanel = {
  today: number;
  week: number;
  tips: number;
  bonuses: number;
  mileage: number;
  deliveries_completed: number;
  acceptance_rate: number;
  completion_rate: number;
  online_minutes: number;
  effective_hourly: number;
};

export type DriverPerformancePanel = {
  customer_rating: number;
  safety_score: number;
  on_time_pct: number;
  avg_delivery_min: number;
  avg_wait_min: number;
  total_miles: number;
  current_streak: number;
};

export type DispatchExplainPanel = {
  order_id: string;
  dispatch_score: number;
  restaurant_distance_pct: number;
  driver_distance_pct: number;
  predicted_wait_pct: number;
  traffic_pct: number;
  workload_pct: number;
  profitability: number;
  confidence: number;
  reason: string;
};

export type RestaurantActiveOrder = {
  order_id: string;
  customer_name: string;
  driver_name?: string;
  driver_id?: string;
  order_value: number;
  status: string;
  live_status: string;
  prep_timer_min: number;
  eta_pickup_min?: number;
  eta_delivery_min?: number;
  delay_warning?: string;
  driver_lat?: number;
  driver_lng?: number;
  driver_rating?: number;
  vehicle_type?: string;
  timeline: Array<{ step: string; at?: string; done: boolean }>;
  customer_lat?: number;
  customer_lng?: number;
};

export type RestaurantPerformancePanel = {
  avg_prep_min: number;
  late_orders: number;
  avg_pickup_min: number;
  avg_delivery_min: number;
  repeat_customers: number;
  daily_revenue: number;
  weekly_revenue: number;
  monthly_revenue: number;
};

export type DriverLogisticsView = {
  driver_id?: string;
  status: DriverMapStatus;
  position: { lat: number; lng: number } | null;
  heading_deg?: number;
  speed_kmh: number;
  remaining_distance_km: number;
  eta_min: number;
  markers: LogisticsMarker[];
  routes: RoutePolyline[];
  queue: DeliveryQueueItem[];
  hotspots: DemandHotspot[];
  earnings: DriverEarningsPanel;
  performance: DriverPerformancePanel;
  dispatch: DispatchExplainPanel[];
  updated_at: string;
};

export type RestaurantLogisticsView = {
  restaurant: { restaurant_id: string; name: string; lat: number; lng: number };
  markers: LogisticsMarker[];
  routes: RoutePolyline[];
  active_orders: RestaurantActiveOrder[];
  arrivals: Array<{ order_id: string; message: string; severity: "info" | "warning" | "success" }>;
  performance: RestaurantPerformancePanel;
  heatmap_zones: DemandHotspot[];
  insights: string[];
  updated_at: string;
};

export type AdminLogisticsView = {
  drivers_online: number;
  active_orders: number;
  restaurants_active: number;
  markers: LogisticsMarker[];
  avg_wait_min: number;
  driver_utilization_pct: number;
  bottlenecks: string[];
  updated_at: string;
};
