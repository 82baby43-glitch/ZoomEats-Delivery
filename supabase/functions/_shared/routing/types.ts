/** Core types for ZoomEats Uber-grade routing intelligence layer. */

export type StopType = "pickup" | "dropoff";
export type RoadType = "urban" | "suburban" | "highway";
export type RoutingEventType = "route.updated" | "eta.changed" | "order.inserted" | "stack.modified";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteStop {
  stop_id: string;
  order_id: string;
  type: StopType;
  lat: number;
  lng: number;
  address?: string;
  /** Higher = VIP — locked near front of route */
  priority?: number;
  locked?: boolean;
  completed?: boolean;
  eta_minutes?: number;
  restaurant_id?: string;
  restaurant_name?: string;
}

export interface ActiveOrderRef {
  order_id: string;
  restaurant_id?: string;
  restaurant_name?: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  priority?: number;
  status?: string;
  picked_up?: boolean;
}

export interface DriverRouteState {
  driver_id: string;
  active_orders: ActiveOrderRef[];
  current_location: GeoPoint & {
    speed_mps?: number;
    heading_deg?: number;
    updated_at?: string;
  };
  current_route: RouteStop[];
  remaining_stops: RouteStop[];
  total_eta_minutes: number;
  total_distance_km: number;
  last_reroute_timestamp: string | null;
  fallback_mode?: boolean;
  last_good_route?: RouteStop[];
  earnings_per_hour_estimate?: number;
}

export interface GpsUpdate {
  driver_id: string;
  lat: number;
  lng: number;
  timestamp?: string;
  accuracy_m?: number;
}

export interface GpsStreamState {
  driver_id: string;
  current: GeoPoint;
  speed_mps: number;
  heading_deg: number;
  last_update: string;
  eta_drift_minutes: number;
  samples: Array<{ lat: number; lng: number; ts: number }>;
}

export interface TrafficSegment {
  from: GeoPoint;
  to: GeoPoint;
  road_type: RoadType;
  multiplier: number;
  delay_minutes: number;
}

export interface RouteOptimizationResult {
  route: RouteStop[];
  total_eta_minutes: number;
  total_distance_km: number;
  improvement_pct: number;
  method: "dijkstra_approx" | "nearest_neighbor" | "insert_reoptimize" | "cached";
  reroute_applied: boolean;
  reason?: string;
}

export interface RoutingMetrics {
  optimization_count: number;
  avg_eta_improvement_pct: number;
  reroute_success_rate: number;
  reroute_acceptance_rate: number;
  delivery_time_reduction_min: number;
  last_event_at?: string;
}

export interface RoutingBroadcastPayload {
  event: RoutingEventType;
  driver_id: string;
  route_state?: Partial<DriverRouteState>;
  stop?: RouteStop;
  improvement_pct?: number;
  ts: string;
}

export const ROUTING_CONFIG = {
  GPS_MIN_INTERVAL_MS: 2000,
  GPS_MAX_INTERVAL_MS: 5000,
  REROUTE_MIN_DISTANCE_M: 150,
  CONTINUOUS_LOOP_MS: 12_000,
  REROUTE_DEBOUNCE_MS: 10_000,
  REROUTE_COOLDOWN_MS: 90_000,
  MIN_IMPROVEMENT_PCT: 8,
  SMART_REROUTE_MIN_PCT: 5,
  MAX_DETOUR_INCREASE_PCT: 15,
  INSERTION_CORRIDOR_KM: 2.5,
  BASE_SPEED_KMH: 32,
  PICKUP_WAIT_MIN: 3,
  STACK_HANDLING_MIN: 2,
  STOP_PENALTY_MIN: 1.5,
} as const;
