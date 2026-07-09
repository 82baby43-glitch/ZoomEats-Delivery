export const FOUNDER_DRIVER_MODE_KEY = "zoomeats_founder_driver_mode";
export const FOUNDER_SHADOW_DISPATCH_KEY = "zoomeats_founder_shadow_dispatch";

export function isFounderDriverModeActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(FOUNDER_DRIVER_MODE_KEY) === "1";
}

export function setFounderDriverModeActive(active: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOUNDER_DRIVER_MODE_KEY, active ? "1" : "0");
}

export function isShadowDispatchActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(FOUNDER_SHADOW_DISPATCH_KEY) === "1";
}

export function setShadowDispatchActive(active: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOUNDER_SHADOW_DISPATCH_KEY, active ? "1" : "0");
}
