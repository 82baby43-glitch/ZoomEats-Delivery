import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import "@/App.css";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";

import Landing from "@/pages/Landing";
import RestaurantDetail from "@/pages/RestaurantDetail";
import Cart from "@/pages/Cart";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import Onboarding from "@/pages/Onboarding";
import MyOrders from "@/pages/MyOrders";
import OrderDetail from "@/pages/OrderDetail";
import VendorDashboard from "@/pages/VendorDashboard";
import DeliveryDashboard from "@/pages/DeliveryDashboard";
import AdminPanel from "@/pages/AdminPanel";
import AgreementCenter from "@/pages/AgreementCenter";
import DisclosureForm from "@/pages/DisclosureForm";
import AdminCompliance from "@/pages/AdminCompliance";
import AuthCallback from "@/pages/AuthCallback";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: "var(--primary)" }} />
      </div>
    );
  }
  if (!user) {
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <div className="font-display text-2xl font-bold">Not authorized</div>
          <p className="mt-2" style={{ color: "var(--muted)" }}>This page requires a different role.</p>
        </div>
      </div>
    );
  }
  return children;
}

function AppRouter() {
  const location = useLocation();
  // Synchronous detection of OAuth callback (URL fragment) - prevents race conditions.
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/r/:rid" element={<RestaurantDetail />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/checkout/success" element={<Protected><CheckoutSuccess /></Protected>} />
      <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
      <Route path="/agreements" element={<Protected><AgreementCenter /></Protected>} />
      <Route path="/disclosure" element={<Protected roles={["delivery"]}><DisclosureForm /></Protected>} />
      <Route path="/orders" element={<Protected><MyOrders /></Protected>} />
      <Route path="/orders/:oid" element={<Protected><OrderDetail /></Protected>} />
      <Route path="/vendor" element={<Protected roles={["vendor"]}><VendorDashboard /></Protected>} />
      <Route path="/delivery" element={<Protected roles={["delivery"]}><DeliveryDashboard /></Protected>} />
      <Route path="/admin" element={<Protected roles={["admin"]}><AdminPanel /></Protected>} />
      <Route path="/admin/compliance" element={<Protected roles={["admin"]}><AdminCompliance /></Protected>} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <AppRouter />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
