import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Utensils, Bike, ShoppingBag } from "lucide-react";

const ROLES = [
  { id: "customer", title: "Order food", icon: ShoppingBag, desc: "Discover local kitchens and get them delivered." },
  { id: "vendor", title: "Run a kitchen", icon: Utensils, desc: "List your restaurant, manage menu and orders." },
  { id: "delivery", title: "Deliver orders", icon: Bike, desc: "Earn flexible income on your schedule." },
];

export default function Onboarding() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(null);

  if (!user) {
    navigate("/");
    return null;
  }

  const choose = async (role) => {
    setPicking(role);
    try {
      await api.post("/auth/role", { role });
      await refresh();
      if (role === "vendor") navigate("/vendor");
      else if (role === "delivery") navigate("/delivery");
      else navigate("/");
    } catch {
      setPicking(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="label-eyebrow">Welcome, {user.name?.split(" ")[0]}</div>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
            How will you use ZoomEats?
          </h1>
          <p className="mt-3" style={{ color: "var(--muted)" }}>You can switch later. Pick one to start.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => choose(r.id)}
                disabled={picking}
                className="card card-hover p-6 text-left disabled:opacity-50"
                data-testid={`role-${r.id}`}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-white"
                  style={{ background: "var(--accent)" }}
                >
                  <Icon size={22} />
                </div>
                <h3 className="font-display text-xl font-bold">{r.title}</h3>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{r.desc}</p>
                {picking === r.id && <p className="text-sm mt-3" style={{ color: "var(--primary)" }}>Setting up…</p>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
