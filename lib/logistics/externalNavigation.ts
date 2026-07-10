import type { ExternalNavProvider } from "./externalNavSession";

export type NavDestination = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  name?: string | null;
};

export type NavOrigin = {
  lat?: number | null;
  lng?: number | null;
};

function isValidCoord(lat?: number | null, lng?: number | null): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAndroid() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function isIos() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent);
}

function encodeQuery(value: string) {
  return encodeURIComponent(value);
}

export function buildGoogleMapsDirectionsUrl(
  destination: NavDestination,
  origin?: NavOrigin | null
): string | null {
  const params = new URLSearchParams({ api: "1", travelmode: "driving" });

  if (isValidCoord(destination.lat, destination.lng)) {
    params.set("destination", `${destination.lat},${destination.lng}`);
  } else if (destination.address) {
    params.set("destination", destination.address);
  } else {
    return null;
  }

  if (origin && isValidCoord(origin.lat, origin.lng)) {
    params.set("origin", `${origin.lat},${origin.lng}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildWazeNavigationUrl(destination: NavDestination): string | null {
  if (isValidCoord(destination.lat, destination.lng)) {
    const params = new URLSearchParams({
      ll: `${destination.lat},${destination.lng}`,
      navigate: "yes",
    });
    return `https://waze.com/ul?${params.toString()}`;
  }
  if (destination.address) {
    const params = new URLSearchParams({
      q: destination.address,
      navigate: "yes",
    });
    return `https://waze.com/ul?${params.toString()}`;
  }
  return null;
}

export function buildAppleMapsDirectionsUrl(
  destination: NavDestination,
  origin?: NavOrigin | null
): string | null {
  const params = new URLSearchParams({ dirflg: "d" });

  if (isValidCoord(destination.lat, destination.lng)) {
    params.set("daddr", `${destination.lat},${destination.lng}`);
  } else if (destination.address) {
    params.set("daddr", destination.address);
  } else {
    return null;
  }

  if (origin && isValidCoord(origin.lat, origin.lng)) {
    params.set("saddr", `${origin.lat},${origin.lng}`);
  }

  return `https://maps.apple.com/?${params.toString()}`;
}

/** Native app URL when installed; falls back to https in the handoff hook. */
export function buildGoogleMapsNativeUrl(
  destination: NavDestination,
  origin?: NavOrigin | null
): string | null {
  if (isValidCoord(destination.lat, destination.lng)) {
    const dest = `${destination.lat},${destination.lng}`;
    if (isAndroid()) return `google.navigation:q=${dest}`;
    if (isIos()) {
      const params = new URLSearchParams({
        daddr: dest,
        directionsmode: "driving",
      });
      if (origin && isValidCoord(origin.lat, origin.lng)) {
        params.set("saddr", `${origin.lat},${origin.lng}`);
      }
      return `comgooglemaps://?${params.toString()}`;
    }
  }
  if (destination.address) {
    if (isAndroid()) return `google.navigation:q=${encodeQuery(destination.address)}`;
    if (isIos()) {
      const params = new URLSearchParams({
        daddr: destination.address,
        directionsmode: "driving",
      });
      return `comgooglemaps://?${params.toString()}`;
    }
  }
  return null;
}

export function buildWazeNativeUrl(destination: NavDestination): string | null {
  if (isValidCoord(destination.lat, destination.lng)) {
    return `waze://?ll=${destination.lat},${destination.lng}&navigate=yes`;
  }
  if (destination.address) {
    return `waze://?q=${encodeQuery(destination.address)}&navigate=yes`;
  }
  return null;
}

export function buildAppleMapsNativeUrl(
  destination: NavDestination,
  origin?: NavOrigin | null
): string | null {
  if (!isIos()) return null;
  const params = new URLSearchParams({ dirflg: "d" });
  if (isValidCoord(destination.lat, destination.lng)) {
    params.set("daddr", `${destination.lat},${destination.lng}`);
  } else if (destination.address) {
    params.set("daddr", destination.address);
  } else {
    return null;
  }
  if (origin && isValidCoord(origin.lat, origin.lng)) {
    params.set("saddr", `${origin.lat},${origin.lng}`);
  }
  return `maps://?${params.toString()}`;
}

export type ExternalNavLink = {
  id: ExternalNavProvider;
  label: string;
  webUrl: string;
  nativeUrl: string | null;
};

export function buildExternalNavLinks(
  destination: NavDestination,
  origin?: NavOrigin | null,
  options: { includeApple?: boolean } = {}
): ExternalNavLink[] {
  const links: ExternalNavLink[] = [
    {
      id: "google",
      label: "Google Maps",
      webUrl: buildGoogleMapsDirectionsUrl(destination, origin) || "",
      nativeUrl: buildGoogleMapsNativeUrl(destination, origin),
    },
    {
      id: "waze",
      label: "Waze",
      webUrl: buildWazeNavigationUrl(destination) || "",
      nativeUrl: buildWazeNativeUrl(destination),
    },
  ];

  if (options.includeApple) {
    links.push({
      id: "apple",
      label: "Apple Maps",
      webUrl: buildAppleMapsDirectionsUrl(destination, origin) || "",
      nativeUrl: buildAppleMapsNativeUrl(destination, origin),
    });
  }

  return links.filter((link) => link.webUrl);
}
