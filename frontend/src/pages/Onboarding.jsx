import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Utensils, Bike, ShoppingBag, Shield, Check } from "lucide-react";

const BASE_ROLES = [
  { id: "customer", title: "Order food", icon: ShoppingBag, desc: "Discover local kitchens and get them delivered.", path: "/" },
  { id: "vendor", title: "Run a kitchen", icon: Utensils, desc: "List your restaurant, manage menu and orders.", path: "/vendor" },
  { id: "delivery", title: "Deliver orders", icon: Bike, desc: "Earn flexible income on your schedule.", path: "/delivery" },
];

const ADMIN_ROLE = {
  id: "admin", title: "Platform owner", icon: Shield, desc: "Approve restaurants, watch platform metrics, manage users.", path: "/admin",
};

export default function Onboarding() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(null);

  if (!user) {
    navigate("/");
    return null;
  }

  const isAdmin = user.role === "admin";
  // Admins see all 4 tiles (admin first); everyone else sees the 3 base options.
  const roles = isAdmin ? [ADMIN_ROLE, ...BASE_ROLES] : BASE_ROLES;

  const choose = async (role) => {
    setPicking(role.id);
    try {
      // Same role as currently assigned → just navigate, no role change.
      // Different role → switch (admins are immutable on the backend, so any non-admin
      // role click for an admin will silently fail; we just navigate them to that view).
      if (role.id !== user.role && !isAdmin) {
        await api.post("/auth/role", { role: role.id });
        await refresh();
      }
      navigate(role.path);
    } catch {
      setPicking(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <div className="label-eyebrow">Welcome back, {user.name?.split(" ")[0]}</div>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
            How are you using ZoomEats today?
          </h1>
          <p className="mt-3" style={{ color: "var(--muted)" }} data-testid="onboarding-subtitle">
            {isAdmin
              ? "Pick a workspace to enter. You can always come back here on next sign-in."
              : "Pick a mode. You can switch any time."}
          </p>
        </div>

        <div className={isAdmin ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" : "grid grid-cols-1 md:grid-cols-3 gap-5"}>
          {roles.map((r) => {
            const Icon = r.icon;
            const isCurrent = r.id === user.role;
            return (
              <button
                key={r.id}
                onClick={() => choose(r)}
                disabled={picking}
                className="card card-hover p-6 text-left disabled:opacity-50 relative"
                style={isCurrent ? { borderColor: "var(--primary)" } : {}}
                data-testid={`role-${r.id}`}
              >
                {isCurrent && (
                  <span
                    className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md"
                    style={{ background: "var(--primary)", color: "#0A0A0A" }}
                    data-testid={`current-role-${r.id}`}
                  >
                    <Check size={12} /> Current
                  </span>
                )}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "var(--primary)", color: "#0A0A0A" }}
                >
                  <Icon size={22} />
                </div>
                <h3 className="font-display text-xl font-bold">{r.title}</h3>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{r.desc}</p>
                <p className="text-sm mt-4 font-bold" style={{ color: isCurrent ? "var(--primary)" : "var(--text)" }}>
                  {picking === r.id ? "Loading…" : isCurrent ? "Continue →" : "Enter →"}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
