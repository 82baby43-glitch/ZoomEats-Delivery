const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || "";

export function publicStorageUrl(bucket: string, path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function sanitizeImageFileName(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop() : "jpg";
  const safeExt = (ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `photo_${Date.now()}.${safeExt}`;
}

export function isAllowedImageType(contentType: string): boolean {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(contentType.toLowerCase());
}

export function parseNameParts(name?: string | null, first?: string | null, last?: string | null) {
  const firstName = first?.trim() || "";
  const lastName = last?.trim() || "";
  if (firstName || lastName) return { firstName, lastName };
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

export function buildDisplayName(
  displayName?: string | null,
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null
) {
  if (displayName?.trim()) return displayName.trim();
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || fallback || "User";
}

export function initialsFromName(name?: string | null): string {
  const parts = String(name || "U").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "U";
}

export async function deleteStoragePaths(
  db: { storage: { from: (bucket: string) => { remove: (paths: string[]) => Promise<unknown> } } },
  bucket: string,
  paths: Array<string | null | undefined>
) {
  const clean = [...new Set(paths.filter(Boolean).map((p) => String(p)))];
  if (!clean.length) return;
  try {
    await db.storage.from(bucket).remove(clean);
  } catch {
    /* best effort cleanup */
  }
}
