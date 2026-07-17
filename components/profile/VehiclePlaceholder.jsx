"use client";

import { VEHICLE_TYPES } from "@/lib/profiles/types";
import { Car, Bike, Truck, Circle } from "lucide-react";

const ICONS = {
  car: Car,
  suv: Car,
  pickup_truck: Truck,
  motorcycle: Bike,
  scooter: Bike,
  bicycle: Bike,
  electric_bike: Bike,
  walking: Circle,
};

export default function VehiclePlaceholder({ vehicleType = "car", className = "" }) {
  const type = VEHICLE_TYPES.find((t) => t.id === vehicleType)?.label || "Vehicle";
  const Icon = ICONS[vehicleType] || Car;
  return (
    <div
      className={`rounded-xl flex flex-col items-center justify-center gap-2 ${className}`}
      style={{ background: "var(--surface-2)", minHeight: 120 }}
      data-testid="vehicle-placeholder"
    >
      <Icon size={36} style={{ color: "var(--primary)" }} />
      <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>{type}</span>
    </div>
  );
}
