import type { DriverRouteState, GpsStreamState, GpsUpdate } from "./types";
import { ROUTING_CONFIG } from "./types";
import { bearingDeg, metersBetween } from "./geo";
import { recordDriverSpeed } from "./eta-engine";

const streamState = new Map<string, GpsStreamState>();

export function ingestGpsUpdate(update: GpsUpdate): GpsStreamState {
  const ts = update.timestamp ? new Date(update.timestamp).getTime() : Date.now();
  const prev = streamState.get(update.driver_id);

  let speed_mps = 0;
  let heading_deg = prev?.heading_deg ?? 0;
  let eta_drift_minutes = prev?.eta_drift_minutes ?? 0;

  if (prev) {
    const dtSec = Math.max(0.5, (ts - new Date(prev.last_update).getTime()) / 1000);
    const distM = metersBetween(prev.current, { lat: update.lat, lng: update.lng });
    speed_mps = distM / dtSec;
    if (distM > 5) {
      heading_deg = bearingDeg(prev.current, { lat: update.lat, lng: update.lng });
    }
    recordDriverSpeed(update.driver_id, speed_mps);

    const expectedMps = 8.9;
    if (speed_mps < expectedMps * 0.6 && distM > 20) {
      eta_drift_minutes += 0.5;
    } else if (speed_mps > expectedMps * 1.2) {
      eta_drift_minutes = Math.max(0, eta_drift_minutes - 0.25);
    }
  }

  const samples = [...(prev?.samples ?? []), { lat: update.lat, lng: update.lng, ts }];
  if (samples.length > 30) samples.shift();

  const state: GpsStreamState = {
    driver_id: update.driver_id,
    current: { lat: update.lat, lng: update.lng },
    speed_mps,
    heading_deg,
    last_update: new Date(ts).toISOString(),
    eta_drift_minutes,
    samples,
  };

  streamState.set(update.driver_id, state);
  return state;
}

export function getGpsStreamState(driverId: string): GpsStreamState | null {
  return streamState.get(driverId) ?? null;
}

export function shouldTriggerRerouteFromGps(
  driverId: string,
  driverState: DriverRouteState
): boolean {
  const gps = streamState.get(driverId);
  if (!gps || !driverState.current_location) return false;

  const movedM = metersBetween(driverState.current_location, gps.current);
  return movedM >= ROUTING_CONFIG.REROUTE_MIN_DISTANCE_M;
}

export function applyGpsToRouteState(
  driverState: DriverRouteState,
  update: GpsUpdate
): DriverRouteState {
  const gps = ingestGpsUpdate(update);
  return {
    ...driverState,
    current_location: {
      lat: gps.current.lat,
      lng: gps.current.lng,
      speed_mps: gps.speed_mps,
      heading_deg: gps.heading_deg,
      updated_at: gps.last_update,
    },
    total_eta_minutes: driverState.total_eta_minutes + gps.eta_drift_minutes,
  };
}

export function clearGpsStream(driverId: string) {
  streamState.delete(driverId);
}
