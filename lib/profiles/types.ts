export const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export const VEHICLE_TYPES = [
  { id: "car", label: "Car" },
  { id: "suv", label: "SUV" },
  { id: "pickup_truck", label: "Pickup Truck" },
  { id: "motorcycle", label: "Motorcycle" },
  { id: "scooter", label: "Scooter" },
  { id: "bicycle", label: "Bicycle" },
  { id: "electric_bike", label: "Electric Bike" },
  { id: "walking", label: "Walking" },
] as const;

export const VEHICLE_PHOTO_TYPES = [
  { id: "front", label: "Front view", required: true },
  { id: "rear", label: "Rear view", required: false },
  { id: "driver_side", label: "Driver side", required: false },
  { id: "passenger_side", label: "Passenger side", required: false },
  { id: "interior", label: "Interior", required: false },
  { id: "cargo", label: "Cargo area", required: false },
] as const;

export type ProfilePayload = {
  user_id: string;
  email: string;
  role: string;
  account_type: string;
  member_since: string | null;
  account_status: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  name: string | null;
  phone: string | null;
  picture: string | null;
  profile_photo_url: string | null;
  thumbnail_photo_url: string | null;
  profile_photo_status?: string;
  driver_stats?: {
    rating: number | null;
    total_deliveries: number;
    completion_rate: number;
    online: boolean;
    earnings_summary?: { available: number; pending: number };
    background_check_status?: string;
    insurance_status?: string;
  };
  merchant?: {
    restaurant_name?: string;
    logo_url?: string;
    cover_url?: string;
    phone?: string;
    hours?: unknown;
  };
};
