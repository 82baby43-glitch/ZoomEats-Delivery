/** Persisted workspace pick from Switch mode (/onboarding) — does not change DB role. */
export const WORKSPACE_MODE_KEY = "zoomeats_workspace_mode";

export type WorkspaceMode = "admin" | "customer" | "delivery" | "vendor";

export function setWorkspaceMode(mode: WorkspaceMode): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(WORKSPACE_MODE_KEY, mode);
}

export function getWorkspaceMode(): WorkspaceMode | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(WORKSPACE_MODE_KEY);
  if (raw === "admin" || raw === "customer" || raw === "delivery" || raw === "vendor") return raw;
  return null;
}

export function clearWorkspaceMode(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(WORKSPACE_MODE_KEY);
}
