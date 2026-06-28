import apiClient, {
  invalidate as invalidateCache,
  clearCache,
  getCacheSnapshot,
} from "./apiClient";
import { API_CONFIG } from "./api/config";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

/**
 * Serialize axios-style `params` into a query string.
 */
function buildUrl(path, params) {
  const base = `${API}${path}`;
  if (!params || typeof params !== "object" || !Object.keys(params).length) return base;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)));
    } else {
      search.set(key, String(value));
    }
  }

  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

function mergeOpts(opts = {}) {
  const { params, ...rest } = opts;
  return rest;
}

// Compatibility wrapper mimicking axios `.get/.post` returning `{ data }`
export const api = {
  get: async (path, opts = {}) => {
    const url = buildUrl(path, opts.params);
    const data = await apiClient.request(url, { method: "GET", ...mergeOpts(opts) });
    return { data };
  },
  post: async (path, body = {}, opts = {}) => {
    const url = buildUrl(path, opts.params);
    const data = await apiClient.request(url, { method: "POST", body, ...mergeOpts(opts), dontCache: true });
    return { data };
  },
  put: async (path, body = {}, opts = {}) => {
    const url = buildUrl(path, opts.params);
    const data = await apiClient.request(url, { method: "PUT", body, ...mergeOpts(opts), dontCache: true });
    return { data };
  },
  delete: async (path, opts = {}) => {
    const url = buildUrl(path, opts.params);
    const data = await apiClient.request(url, { method: "DELETE", ...mergeOpts(opts), dontCache: true });
    return { data };
  },
};

export const getWalletBalance = async () => api.get("/wallet/balance");
export const getWalletTransactions = async () => api.get("/wallet/transactions");
export const requestWalletPayout = async (amount) => api.post("/wallet/payout", { amount });

// Gateway utilities — available for future modules and cache invalidation after mutations
export { invalidateCache, clearCache, getCacheSnapshot, API_CONFIG };
