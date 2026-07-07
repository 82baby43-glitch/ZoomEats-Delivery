/** Parse OSM opening_hours tags and evaluate open-now status. */

export type OsmOpeningHoursJson = {
  source: "osm" | "google";
  raw?: string;
  periods?: Array<{ day: number; open: number; close: number }>;
};

const DAY_INDEX: Record<string, number> = {
  mo: 0,
  tu: 1,
  we: 2,
  th: 3,
  fr: 4,
  sa: 5,
  su: 6,
};

function parseTimeToMinutes(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?:\+)?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function expandDays(token: string): number[] {
  const parts = token.split("-");
  if (parts.length === 1) {
    const day = DAY_INDEX[parts[0].trim().toLowerCase().slice(0, 2)];
    return day == null ? [] : [day];
  }
  const start = DAY_INDEX[parts[0].trim().toLowerCase().slice(0, 2)];
  const end = DAY_INDEX[parts[1].trim().toLowerCase().slice(0, 2)];
  if (start == null || end == null) return [];
  const days: number[] = [];
  for (let d = start; ; d = (d + 1) % 7) {
    days.push(d);
    if (d === end) break;
  }
  return days;
}

export function parseOsmOpeningHours(raw: string): OsmOpeningHoursJson | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^24\s*\/\s*7$/i.test(trimmed)) {
    return { source: "osm", raw: trimmed, periods: [{ day: -1, open: 0, close: 24 * 60 }] };
  }

  const periods: Array<{ day: number; open: number; close: number }> = [];
  for (const segment of trimmed.split(";")) {
    const part = segment.trim();
    if (!part) continue;
    const match = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)\s+(.+)$/);
    if (!match) continue;
    const days = expandDays(match[1]);
    const timePart = match[2].trim();
    const overnight = timePart.includes("+");
    const [openRaw, closeRaw] = timePart.split("-");
    const open = parseTimeToMinutes(openRaw);
    let close = parseTimeToMinutes((closeRaw || "").replace("+", ""));
    if (open == null || close == null) continue;
    if (overnight || close <= open) close += 24 * 60;
    for (const day of days) {
      periods.push({ day, open, close: Math.min(close, 24 * 60) });
      if (close > 24 * 60) {
        periods.push({ day: (day + 1) % 7, open: 0, close: close - 24 * 60 });
      }
    }
  }

  if (!periods.length) return { source: "osm", raw: trimmed };
  return { source: "osm", raw: trimmed, periods };
}

function getLocalTimeParts(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { day: dayMap[weekday.slice(0, 3)] ?? 0, minutes: hour * 60 + minute };
}

function isOpenFromGoogleHours(value: Record<string, unknown>): boolean | null {
  if (typeof value.openNow === "boolean") return value.openNow;
  const periods = Array.isArray(value.periods) ? value.periods : null;
  if (!periods?.length) return null;
  const now = new Date();
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const period of periods) {
    const p = period as { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } };
    const openDay = p.open?.day;
    const closeDay = p.close?.day;
    const openMin = (p.open?.hour ?? 0) * 60 + (p.open?.minute ?? 0);
    const closeMin = (p.close?.hour ?? 0) * 60 + (p.close?.minute ?? 0);
    if (openDay == null) continue;
    if (openDay === day && closeDay === day && minutes >= openMin && minutes < closeMin) return true;
  }
  return false;
}

export function isRestaurantOpenNow(openingHours: unknown, timezone = "America/Chicago"): boolean {
  if (!openingHours) return true;

  if (typeof openingHours === "object" && openingHours !== null) {
    const obj = openingHours as Record<string, unknown>;
    if (obj.source === "osm") {
      const parsed = obj as OsmOpeningHoursJson;
      if (parsed.periods?.some((p) => p.day === -1)) return true;
      if (!parsed.periods?.length && parsed.raw) {
        const reparsed = parseOsmOpeningHours(parsed.raw);
        return isRestaurantOpenNow(reparsed, timezone);
      }
      const { day, minutes } = getLocalTimeParts(timezone);
      return (parsed.periods ?? []).some((p) => p.day === day && minutes >= p.open && minutes < p.close);
    }
    const google = isOpenFromGoogleHours(obj);
    if (google != null) return google;
    if (typeof obj.raw === "string") {
      return isRestaurantOpenNow(parseOsmOpeningHours(obj.raw), timezone);
    }
  }

  if (typeof openingHours === "string") {
    return isRestaurantOpenNow(parseOsmOpeningHours(openingHours), timezone);
  }

  return true;
}
