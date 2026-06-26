import apiClient from "./apiClient";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Compatibility wrapper mimicking axios `.get/.post` returning `{ data }`
export const api = {
  get: async (path, opts = {}) => {
    const url = `${API}${path}`;
    const data = await apiClient.request(url, { method: "GET", ...opts });
    return { data };
  },
  post: async (path, body = {}, opts = {}) => {
    const url = `${API}${path}`;
    const data = await apiClient.request(url, { method: "POST", body, ...opts, dontCache: true });
    return { data };
  },
  put: async (path, body = {}, opts = {}) => {
    const url = `${API}${path}`;
    const data = await apiClient.request(url, { method: "PUT", body, ...opts, dontCache: true });
    return { data };
  },
  delete: async (path, opts = {}) => {
    const url = `${API}${path}`;
    const data = await apiClient.request(url, { method: "DELETE", ...opts, dontCache: true });
    return { data };
  }
};

export const getWalletBalance = async () => api.get("/wallet/balance");
export const getWalletTransactions = async () => api.get("/wallet/transactions");
export const requestWalletPayout = async (amount) => api.post("/wallet/payout", { amount });
