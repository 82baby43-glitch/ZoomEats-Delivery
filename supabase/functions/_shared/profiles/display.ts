export function initialsFromName(name: string | null | undefined): string {
  const parts = String(name || "U").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "U";
}

export function firstNameFromDisplay(name: string | null | undefined): string {
  return String(name || "Driver").trim().split(/\s+/)[0] || "Driver";
}
