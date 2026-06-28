/**
 * Mock API responses for local frontend development.
 * Enabled when REACT_APP_USE_MOCK_API=true
 */

const RESTAURANTS = [
  {
    id: "mock-r1",
    name: "Mock Kitchen",
    cuisine: "American",
    rating: 4.8,
    eta_minutes: 25,
    image_url: "https://images.pexels.com/photos/5732798/pexels-photo-5732798.jpeg?auto=compress&cs=tinysrgb&w=400",
    featured: true,
  },
  {
    id: "mock-r2",
    name: "Demo Deli",
    cuisine: "Mediterranean",
    rating: 4.6,
    eta_minutes: 20,
    image_url: "https://images.pexels.com/photos/5732798/pexels-photo-5732798.jpeg?auto=compress&cs=tinysrgb&w=400",
    featured: false,
  },
];

const MENU_ITEMS = [
  { id: "m1", name: "Mock Burger", price: 12.5, category: "Mains", description: "Demo item" },
  { id: "m2", name: "Mock Salad", price: 9.0, category: "Starters", description: "Demo item" },
];

function match(url, method = "GET") {
  let pathname = url;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    // keep raw
  }
  return { pathname, method: method.toUpperCase() };
}

export function getMockResponse(url, { method = "GET", body = null } = {}) {
  const { pathname, method: m } = match(url, method);

  if (m === "GET" && pathname === "/api/auth/me") {
    return { id: "mock-user", email: "dev@zoomeats.local", role: "customer", name: "Dev User" };
  }

  if (m === "GET" && pathname === "/api/restaurants") {
    return RESTAURANTS;
  }

  if (m === "GET" && /^\/api\/restaurants\/[^/]+$/.test(pathname)) {
    const id = pathname.split("/").pop();
    return {
      id,
      name: "Mock Restaurant",
      cuisine: "Demo",
      rating: 4.7,
      eta_minutes: 22,
      menu_items: MENU_ITEMS,
    };
  }

  if (m === "GET" && pathname === "/api/orders/my") {
    return [];
  }

  if (m === "GET" && pathname === "/api/wallet/balance") {
    return { available: 0, pending: 0, currency: "usd" };
  }

  if (m === "GET" && pathname === "/api/wallet/transactions") {
    return [];
  }

  if (m === "GET" && pathname === "/api/admin/attention") {
    return { total: 0, items: [] };
  }

  if (m === "GET" && pathname === "/api/admin/metrics") {
    return { orders_today: 0, revenue_today: 0, active_drivers: 0 };
  }

  if (m === "GET" && pathname.startsWith("/api/checkout/status/")) {
    return { status: "complete", payment_status: "paid" };
  }

  if (m === "POST" && pathname === "/api/auth/logout") return { ok: true };
  if (m === "POST" && pathname === "/api/auth/session") return { ok: true, user: { user_id: "mock_user", email: "mock@example.com", name: "Mock User", role: "customer" } };
  if (m === "POST" && pathname === "/api/orders") return { id: "mock-order-1", status: "pending" };
  if (m === "POST" && pathname === "/api/checkout/session") {
    return { url: "https://checkout.stripe.com/mock-session", session_id: "mock_cs_1" };
  }

  if (m === "POST" && pathname === "/api/chat") {
    return { reply: "Mock assistant response for offline development." };
  }

  if (m === "GET" && pathname === "/api/chat/history") {
    return { messages: [] };
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[apiGateway] mock fallback empty response for", m, pathname, body);
  }

  return {};
}
