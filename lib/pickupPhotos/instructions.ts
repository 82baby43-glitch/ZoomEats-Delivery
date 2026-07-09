export const PICKUP_PHOTO_TYPES = [
  {
    id: "entrance",
    label: "Entrance & signage",
    hint: "Capture the main door, restaurant sign, and any suite numbers.",
  },
  {
    id: "parking",
    label: "Parking / loading zone",
    hint: "Show where to park or stand while waiting — curbside, lot, or loading dock.",
  },
  {
    id: "counter",
    label: "Pickup counter or shelf",
    hint: "Photograph the handoff area, pickup shelf, or expo window.",
  },
  {
    id: "order_bag",
    label: "Sealed order bag",
    hint: "Verify labels and seal before leaving — helps with accuracy disputes.",
  },
] as const;

export type PickupPhotoType = (typeof PICKUP_PHOTO_TYPES)[number]["id"];

export type PickupInstructionView = {
  order_id: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_address?: string;
  entrance_instructions: string;
  parking_instructions: string;
  counter_instructions: string;
  shelf_location: string;
  pickup_notes: string;
  checklist: Array<{ id: PickupPhotoType; label: string; hint: string; completed: boolean }>;
  photos: Array<{
    photo_id: string;
    photo_type: PickupPhotoType;
    caption?: string;
    url?: string;
    created_at: string;
    mine?: boolean;
  }>;
};

const DEFAULT_GUIDE = {
  entrance_instructions: "Find the main customer entrance. Look for the restaurant sign or suite number on the door.",
  parking_instructions: "Use marked loading or curbside zones when available. Avoid blocking the drive-thru lane.",
  counter_instructions: "Ask for the order by customer name or order number at the pickup counter.",
  shelf_location: "Check the labeled pickup shelf near the front counter if staff is busy.",
  pickup_notes: "Take photos before pickup to help the next driver at this restaurant.",
};

export function mergePickupGuide(
  restaurantName: string,
  guide: Record<string, unknown> | null | undefined
): Omit<PickupInstructionView, "order_id" | "restaurant_id" | "checklist" | "photos"> {
  return {
    restaurant_name: restaurantName,
    restaurant_address: undefined,
    entrance_instructions: String(guide?.entrance_instructions || DEFAULT_GUIDE.entrance_instructions),
    parking_instructions: String(guide?.parking_instructions || DEFAULT_GUIDE.parking_instructions),
    counter_instructions: String(guide?.counter_instructions || DEFAULT_GUIDE.counter_instructions),
    shelf_location: String(guide?.shelf_location || DEFAULT_GUIDE.shelf_location),
    pickup_notes: String(guide?.pickup_notes || DEFAULT_GUIDE.pickup_notes),
  };
}

export function buildChecklist(uploadedTypes: Set<string>) {
  return PICKUP_PHOTO_TYPES.map((item) => ({
    ...item,
    completed: uploadedTypes.has(item.id),
  }));
}
