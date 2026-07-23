export type DispatchEval = {
  ok: boolean;
  status: "pass" | "warn";
  detail: string;
};

/** Evaluate dispatch-order response for launch audit / simulation checks. */
export function evaluateDispatchResult(
  res: { ok: boolean; status?: number },
  data: Record<string, unknown>
): DispatchEval {
  const driverId = typeof data.driver_id === "string" ? data.driver_id : null;
  const reason = typeof data.reason === "string" ? data.reason : null;
  const error = typeof data.error === "string" ? data.error : null;

  if (!res.ok && (res.status === 401 || error === "unauthorized")) {
    return {
      ok: false,
      status: "warn",
      detail: "dispatch-order returned 401 — EDGE_FUNCTION_SECRET auth required",
    };
  }

  const dispatchOk =
    res.ok &&
    Boolean(
      driverId ||
        reason === "deferred_to_driver_offers" ||
        data.uber_delivery_id ||
        data.delivery_type === "uber"
    );

  if (!dispatchOk) {
    return {
      ok: false,
      status: "warn",
      detail: reason || error || "not assigned",
    };
  }

  const detail = driverId
    ? `driver ${driverId}`
    : reason === "deferred_to_driver_offers"
      ? "deferred_to_driver_offers — offer queue active"
      : data.uber_delivery_id
        ? `uber ${String(data.uber_delivery_id)}`
        : JSON.stringify(data).slice(0, 80);

  return { ok: true, status: "pass", detail };
}
