/** Multi-vehicle delivery mode types — extensible for future modes. */

export type DeliveryModeKey = "car" | "bicycle" | "scooter" | "walking" | "suv";

export type VehicleClass = "motor" | "motor_large" | "human_powered" | "foot";

export type DeliveryModeApprovalStatus = "pending" | "approved" | "rejected" | "suspended";

export interface DeliveryModeDefinition {
  mode_key: DeliveryModeKey;
  label: string;
  icon: string;
  vehicle_class: VehicleClass;
  max_distance_km: number;
  max_weight_lbs: number;
  max_bag_count: number;
  max_large_drinks: number;
  requires_license: boolean;
  requires_vehicle_registration: boolean;
  requires_insurance: boolean;
  base_speed_kmh: number;
  sort_order: number;
  active: boolean;
  metadata?: Record<string, unknown>;
}

export interface DriverDeliveryMode {
  id: string;
  user_id: string;
  driver_id?: string;
  mode_key: DeliveryModeKey;
  approval_status: DeliveryModeApprovalStatus;
  approved_at?: string;
  safety_acknowledged: boolean;
  notes?: string;
}

export interface DriverVehicle {
  vehicle_id: string;
  user_id: string;
  driver_id?: string;
  mode_key: DeliveryModeKey;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  license_plate?: string;
  insurance_expires_at?: string;
  registration_expires_at?: string;
  is_active: boolean;
}

export interface DriverBicycleProfile {
  profile_id: string;
  user_id: string;
  driver_id?: string;
  bike_type?: string;
  cargo_bag_capacity?: string;
  is_electric: boolean;
  is_active: boolean;
}

export interface OrderDeliveryRequirements {
  estimated_weight_lbs?: number;
  bag_count?: number;
  large_drink_count?: number;
  delivery_distance_km?: number;
  required_vehicle_class?: VehicleClass;
  special_handling?: string;
}

export interface DriverFleetProfile {
  active_delivery_mode: DeliveryModeKey | null;
  active_vehicle_id: string | null;
  approved_modes: DriverDeliveryMode[];
  vehicles: DriverVehicle[];
  bicycle_profile: DriverBicycleProfile | null;
  mode_definitions: DeliveryModeDefinition[];
}

export interface ModeEarningsStats {
  mode_key: DeliveryModeKey;
  deliveries: number;
  total_earnings: number;
  avg_earnings: number;
  total_distance_km: number;
  avg_delivery_min: number;
  acceptance_rate: number;
  completion_rate: number;
}

export interface FleetAnalytics {
  mode_popularity: Array<{ mode_key: string; count: number; pct: number }>;
  avg_delivery_time_by_mode: Array<{ mode_key: string; avg_min: number }>;
  avg_earnings_by_mode: Array<{ mode_key: string; avg: number }>;
  dispatch_efficiency_by_mode: Array<{ mode_key: string; completion_rate: number }>;
}
