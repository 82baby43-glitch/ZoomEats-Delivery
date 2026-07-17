export function initialsFromName(name) {
  const parts = String(name || "U").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "U";
}

export function firstNameFromDisplay(name) {
  return String(name || "Driver").trim().split(/\s+/)[0] || "Driver";
}
