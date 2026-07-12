"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, ClipboardList, User, Bike, Map, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getClientAppType, getPwaConfig } from "@/lib/pwa/appContext";
import { normalizeRole } from "@/lib/compliance/authz";

function accountHref(user, appType) {
  if (user) return "/account";
  return getPwaConfig(appType).loginPath;
}

function Tab({ href, label, icon: Icon, active }) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors ${active ? "font-bold" : ""}`}
      style={{ color: active ? "var(--primary)" : "var(--muted)" }}
      data-testid={`mobile-tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  );
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const appType = getClientAppType();
  const role = normalizeRole(user?.role || "customer");

  const hideOn = ["/login", "/auth/callback", "/checkout", "/agreements", "/pending-approval", "/onboarding"];
  if (hideOn.some((p) => pathname.startsWith(p))) return null;

  const isActive = (href) => pathname === href || (href !== "/" && pathname.startsWith(href));

  const accountPath = accountHref(user, appType);
  const accountActive = isActive("/account") || isActive(accountPath);

  if (appType === "driver" || role === "delivery") {
    return (
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl safe-area-pb" style={{ background: "rgba(10,10,10,0.92)", borderColor: "var(--border)" }} aria-label="Driver navigation">
        <div className="flex max-w-lg mx-auto">
          <Tab href="/driver/dashboard" label="Drive" icon={Bike} active={isActive("/driver/dashboard")} />
          <Tab href="/driver/live-map" label="Map" icon={Map} active={isActive("/driver/live-map")} />
          <Tab href={accountPath} label="Account" icon={User} active={accountActive} />
        </div>
      </nav>
    );
  }

  if (appType === "restaurant" || role === "vendor") {
    return (
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl safe-area-pb" style={{ background: "rgba(10,10,10,0.92)", borderColor: "var(--border)" }} aria-label="Restaurant navigation">
        <div className="flex max-w-lg mx-auto">
          <Tab href="/restaurant/dashboard" label="Orders" icon={LayoutDashboard} active={isActive("/restaurant/dashboard")} />
          <Tab href="/restaurant/live-map" label="Map" icon={Map} active={isActive("/restaurant/live-map")} />
          <Tab href={accountPath} label="Account" icon={User} active={accountActive} />
        </div>
      </nav>
    );
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl safe-area-pb" style={{ background: "rgba(10,10,10,0.92)", borderColor: "var(--border)" }} aria-label="Customer navigation">
      <div className="flex max-w-lg mx-auto">
        <Tab href="/" label="Home" icon={Home} active={pathname === "/"} />
        <Tab href="/orders" label="Orders" icon={ClipboardList} active={isActive("/orders")} />
        <Tab href="/cart" label="Cart" icon={ShoppingBag} active={isActive("/cart")} />
        <Tab href={accountPath} label="Account" icon={User} active={accountActive} />
      </div>
    </nav>
  );
}
