import { redirect } from "next/navigation";

export default function RestaurantLoginRedirect() {
  redirect("/login?redirect=%2Frestaurant%2Fdashboard");
}
