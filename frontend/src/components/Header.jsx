import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { ShoppingBag, User as UserIcon, LogOut, LayoutDashboard, Bike, Shield, Repeat } from "lucide-react";
import { useState } from "react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const startLogin = () => {
  const redirectUrl = window.location.origin + "/auth/callback";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

export default function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const itemCount = cart.items.reduce((s, x) => s + x.quantity, 0);

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b"
      style={{ background: "rgba(10, 10, 10, 0.85)", borderColor: "var(--border)" }}
      data-testid="app-header"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-12 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
          <img
            src="https://customer-assets.emergentagent.com/job_builder-hub-470/artifacts/ndtc6nc9_file_000000004a0471f792fc274e17837e5e.png"
            alt="ZoomEats"
            className="h-12 md:h-14 w-auto rounded-lg"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="btn-ghost" data-testid="nav-home">Discover</Link>
          {user && <Link to="/orders" className="btn-ghost" data-testid="nav-orders">My Orders</Link>}
          {user?.role === "vendor" && (
            <Link to="/vendor" className="btn-ghost flex items-center gap-2" data-testid="nav-vendor">
              <LayoutDashboard size={16} /> Vendor
            </Link>
          )}
          {user?.role === "delivery" && (
            <Link to="/delivery" className="btn-ghost flex items-center gap-2" data-testid="nav-delivery">
              <Bike size={16} /> Delivery
            </Link>
          )}
          {user?.role === "admin" && (
            <Link to="/admin" className="btn-ghost flex items-center gap-2" data-testid="nav-admin">
              <Shield size={16} /> Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <button
            className="btn-ghost relative flex items-center gap-2"
            onClick={() => navigate("/cart")}
            data-testid="cart-button"
          >
            <ShoppingBag size={20} />
            {itemCount > 0 && (
              <span
                className="absolute -top-1 -right-1 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                style={{ background: "var(--primary)", color: "#0A0A0A" }}
                data-testid="cart-count"
              >
                {itemCount}
              </span>
            )}
          </button>

          {user ? (
            <div className="relative">
              <button
                className="flex items-center gap-2 btn-ghost"
                onClick={() => setMenuOpen((v) => !v)}
                data-testid="user-menu-button"
              >
                {user.picture ? (
                  <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <UserIcon size={20} />
                )}
                <span className="hidden md:block font-bold">{user.name?.split(" ")[0]}</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 border rounded-xl shadow-lg overflow-hidden"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                  data-testid="user-menu"
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <div className="text-sm font-bold">{user.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{user.email}</div>
                    <div className="text-xs mt-1 label-eyebrow">Role: {user.role}</div>
                  </div>
                  <button
                    className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
                    onClick={() => { setMenuOpen(false); navigate("/onboarding"); }}
                    data-testid="switch-mode-button"
                  >
                    <Repeat size={16} /> Switch mode
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
                    onClick={logout}
                    data-testid="logout-button"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn-primary" onClick={startLogin} data-testid="login-button">
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
