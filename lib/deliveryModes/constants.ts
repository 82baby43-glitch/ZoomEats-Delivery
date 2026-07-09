import type { DeliveryModeKey } from "./types";

export const DELIVERY_MODE_UI: Record<
  DeliveryModeKey,
  {
    label: string;
    icon: string;
    description: string;
    requirements: string[];
    suitable_for: string[];
    needs_vehicle: boolean;
    needs_bicycle_profile: boolean;
  }
> = {
  car: {
    label: "Car",
    icon: "🚗",
    description: "Deliver with your personal vehicle — best for longer routes and larger orders.",
    requirements: [
      "Valid driver's license",
      "Vehicle information",
      "Vehicle insurance (where required)",
      "License plate",
      "Vehicle make, model, year, and color",
    ],
    suitable_for: [
      "Long-distance deliveries",
      "Large orders",
      "Grocery deliveries",
      "Catering orders",
    ],
    needs_vehicle: true,
    needs_bicycle_profile: false,
  },
  bicycle: {
    label: "Bicycle",
    icon: "🚲",
    description: "Eco-friendly deliveries in dense urban areas and campuses.",
    requirements: ["Government-issued ID", "Safety acknowledgment"],
    suitable_for: [
      "Downtown deliveries",
      "Campus deliveries",
      "Short-distance deliveries",
    ],
    needs_vehicle: false,
    needs_bicycle_profile: true,
  },
  scooter: {
    label: "Scooter / Moped",
    icon: "🛵",
    description: "Fast urban deliveries with a scooter or moped.",
    requirements: [
      "Government-issued ID",
      "License if legally required",
      "Registration/insurance if required by local law",
    ],
    suitable_for: [
      "Medium-distance deliveries",
      "Urban environments",
    ],
    needs_vehicle: true,
    needs_bicycle_profile: false,
  },
  walking: {
    label: "Walking",
    icon: "🚶",
    description: "On-foot deliveries for very short distances in dense areas.",
    requirements: ["Government-issued ID"],
    suitable_for: [
      "Dense downtown districts",
      "University campuses",
      "Large shopping centers",
    ],
    needs_vehicle: false,
    needs_bicycle_profile: false,
  },
  suv: {
    label: "SUV / Large Vehicle",
    icon: "🚙",
    description: "High-capacity deliveries for groceries, catering, and bulk orders.",
    requirements: [
      "Valid driver's license",
      "Vehicle information",
      "Vehicle insurance",
      "License plate",
      "Vehicle make, model, year, and color",
    ],
    suitable_for: [
      "Large grocery orders",
      "Catering",
      "Multi-order batching",
      "Long-distance deliveries",
    ],
    needs_vehicle: true,
    needs_bicycle_profile: false,
  },
};

export const VEHICLE_MODES: DeliveryModeKey[] = ["car", "scooter", "suv"];

export const MODE_MAP_ICONS: Record<DeliveryModeKey, string> = {
  car: "🚗",
  bicycle: "🚲",
  scooter: "🛵",
  walking: "🚶",
  suv: "🚙",
};

export const MODE_MAP_COLORS: Record<DeliveryModeKey, string> = {
  car: "#FBBF24",
  bicycle: "#34D399",
  scooter: "#A78BFA",
  walking: "#7DD3FC",
  suv: "#F97316",
};
