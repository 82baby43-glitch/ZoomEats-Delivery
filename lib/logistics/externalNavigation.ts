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
