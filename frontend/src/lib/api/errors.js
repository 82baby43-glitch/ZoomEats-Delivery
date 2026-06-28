/**
 * Standardized API error normalization.
 * Preserves existing user-facing behavior while giving callers a consistent shape.
 */

export const API_ERROR_CODES = {
  NETWORK: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  ABORTED: "ABORTED",
  HTTP: "HTTP_ERROR",
  AUTH: "AUTH_ERROR",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION: "VALIDATION_ERROR",
  STRIPE: "STRIPE_ERROR",
  SUPABASE: "SUPABASE_ERROR",
  BUSINESS: "BUSINESS_ERROR",
  UNKNOWN: "UNKNOWN_ERROR",
};

export class ApiError extends Error {
  constructor(message, { status, code, original, retryable = false, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? null;
    this.code = code || API_ERROR_CODES.UNKNOWN;
    this.original = original ?? null;
    this.retryable = retryable;
    this.details = details;
  }

  /** Axios-compatible accessor for gradual migration */
  get response() {
    if (!this.status && !this.original) return undefined;
    return { status: this.status, data: this.original };
  }
}

export function isRetryableError(error, status) {
  if (error?.name === "AbortError" || error?.code === API_ERROR_CODES.ABORTED) return false;
  if (error?.code === API_ERROR_CODES.AUTH) return false;
  if (error?.code === API_ERROR_CODES.FORBIDDEN) return false;
  if (error?.code === API_ERROR_CODES.VALIDATION) return false;
  if (error?.code === API_ERROR_CODES.STRIPE) return false;
  if (error?.code === API_ERROR_CODES.BUSINESS) return false;

  const httpStatus = status ?? error?.status ?? null;
  if (!httpStatus) return true; // network / connection reset / timeout
  return [429, 500, 502, 503, 504].includes(httpStatus);
}

export function normalizeSupabaseError(error) {
  const status = error?.status ?? error?.statusCode ?? null;
  const message = error?.message || "Supabase error";
  const code =
    status === 401
      ? API_ERROR_CODES.AUTH
      : status === 403
        ? API_ERROR_CODES.FORBIDDEN
        : API_ERROR_CODES.SUPABASE;

  return new ApiError(message, {
    status,
    code,
    original: error,
    retryable: isRetryableError(null, status),
    details: error?.details ?? error?.hint ?? null,
  });
}

export function normalizeStripeError(error) {
  const status = error?.statusCode ?? error?.status ?? null;
  const message = error?.message || "Stripe payment error";

  return new ApiError(message, {
    status,
    code: API_ERROR_CODES.STRIPE,
    original: error,
    retryable: false,
    details: error?.type ?? null,
  });
}

export function normalizeHttpError(status, body, url) {
  let code = API_ERROR_CODES.HTTP;
  if (status === 401) code = API_ERROR_CODES.AUTH;
  else if (status === 403) code = API_ERROR_CODES.FORBIDDEN;
  else if (status === 400 || status === 422) code = API_ERROR_CODES.VALIDATION;
  else if (url && /\/checkout\/|\/wallet\/|stripe/i.test(url)) code = API_ERROR_CODES.STRIPE;

  const message =
    (typeof body === "object" && (body?.detail || body?.message || body?.error)) ||
    `HTTP ${status}`;

  return new ApiError(String(message), {
    status,
    code,
    original: body,
    retryable: isRetryableError(null, status),
  });
}

export function normalizeNetworkError(error) {
  if (error?.name === "AbortError") {
    return new ApiError("Request aborted", {
      code: API_ERROR_CODES.ABORTED,
      original: error,
      retryable: false,
    });
  }

  if (error?.code === "timeout" || error?.message === "timeout") {
    return new ApiError("Request timed out", {
      code: API_ERROR_CODES.TIMEOUT,
      original: error,
      retryable: true,
    });
  }

  if (error instanceof ApiError) return error;

  return new ApiError(error?.message || "Network error", {
    code: API_ERROR_CODES.NETWORK,
    original: error,
    retryable: true,
  });
}

export default ApiError;
