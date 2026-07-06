/** Collect client device/browser metadata and public IP for agreement audit trail. */

export type ClientMeta = {
  user_agent: string;
  browser: string;
  device: string;
  ip_address: string | null;
};

export function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "unknown";
}

export function detectDevice(ua: string): string {
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

export async function collectClientMeta(): Promise<ClientMeta> {
  if (typeof window === "undefined") {
    return { user_agent: "", browser: "unknown", device: "unknown", ip_address: null };
  }
  const ua = navigator.userAgent;
  let ip: string | null = null;
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    ip = j?.ip || null;
  } catch {
    /* optional */
  }
  return {
    user_agent: ua,
    browser: detectBrowser(ua),
    device: detectDevice(ua),
    ip_address: ip,
  };
}
