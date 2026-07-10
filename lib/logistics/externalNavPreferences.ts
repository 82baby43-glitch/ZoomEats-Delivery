const RETURN_PING_KEY = "zoomeats_external_nav_return_ping";

export function isExternalNavReturnPingEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(RETURN_PING_KEY) === "1";
  } catch {
    return false;
  }
}

export function setExternalNavReturnPingEnabled(enabled: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(RETURN_PING_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
