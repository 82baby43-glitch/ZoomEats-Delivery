const STORAGE_KEY = "zoomeats_external_nav";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export type ExternalNavProvider = "google" | "waze" | "apple";

export type ExternalNavSession = {
  startedAt: number;
  orderId?: string;
  provider: ExternalNavProvider;
};

export function startExternalNavSession(session: {
  orderId?: string;
  provider: ExternalNavProvider;
}) {
  if (typeof sessionStorage === "undefined") return;
  const payload: ExternalNavSession = { ...session, startedAt: Date.now() };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearExternalNavSession() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getExternalNavSession(): ExternalNavSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as ExternalNavSession;
    if (!session?.startedAt || Date.now() - session.startedAt > SESSION_TTL_MS) {
      clearExternalNavSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function isExternalNavSessionActive() {
  return getExternalNavSession() != null;
}
