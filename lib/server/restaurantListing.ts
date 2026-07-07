import { filterPublicRestaurants } from "../restaurants";
import { isRestaurantOpenNow } from "./osmOpeningHours";

export function finalizePublicRestaurantList<
  T extends { name?: string | null; opening_hours?: unknown },
>(rows: T[] | null | undefined, params: { open_now?: string }): T[] {
  let list = filterPublicRestaurants(rows);
  if (params.open_now === "1" || params.open_now === "true") {
    list = list.filter((row) => isRestaurantOpenNow(row.opening_hours));
  }
  return list;
}
