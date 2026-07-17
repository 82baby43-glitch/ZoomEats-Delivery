import { redirect } from "next/navigation";

export default function DriverLoginRedirect() {
  redirect("/login?redirect=%2Fdriver%2Fdashboard");
}
