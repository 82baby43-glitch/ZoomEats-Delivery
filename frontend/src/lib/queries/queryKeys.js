/**
 * TanStack Query key factory.
 * Future modules inherit consistent cache keys automatically.
 */

export const queryKeys = {
  auth: {
    all: ["auth"],
    me: () => [...queryKeys.auth.all, "me"],
  },
  restaurants: {
    all: ["restaurants"],
    list: (params = {}) => [...queryKeys.restaurants.all, "list", params],
    detail: (id) => [...queryKeys.restaurants.all, "detail", id],
  },
  orders: {
    all: ["orders"],
    my: () => [...queryKeys.orders.all, "my"],
    detail: (id) => [...queryKeys.orders.all, "detail", id],
    tracking: (id) => [...queryKeys.orders.all, "tracking", id],
  },
  wallet: {
    all: ["wallet"],
    balance: () => [...queryKeys.wallet.all, "balance"],
    transactions: () => [...queryKeys.wallet.all, "transactions"],
  },
  vendor: {
    all: ["vendor"],
    restaurant: () => [...queryKeys.vendor.all, "restaurant"],
    menu: () => [...queryKeys.vendor.all, "menu"],
    orders: () => [...queryKeys.vendor.all, "orders"],
  },
  delivery: {
    all: ["delivery"],
    available: () => [...queryKeys.delivery.all, "available"],
    my: () => [...queryKeys.delivery.all, "my"],
  },
  admin: {
    all: ["admin"],
    metrics: () => [...queryKeys.admin.all, "metrics"],
    activity: () => [...queryKeys.admin.all, "activity"],
    attention: () => [...queryKeys.admin.all, "attention"],
    digest: () => [...queryKeys.admin.all, "digest"],
    users: (params = {}) => [...queryKeys.admin.all, "users", params],
    restaurants: (params = {}) => [...queryKeys.admin.all, "restaurants", params],
    orders: (params = {}) => [...queryKeys.admin.all, "orders", params],
  },
  chat: {
    all: ["chat"],
    history: () => [...queryKeys.chat.all, "history"],
  },
  agreements: {
    all: ["agreements"],
    list: () => [...queryKeys.agreements.all, "list"],
  },
  compliance: {
    all: ["compliance"],
    reviews: () => [...queryKeys.compliance.all, "reviews"],
  },
};

export default queryKeys;
