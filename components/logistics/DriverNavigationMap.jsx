"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CachedTileLayer } from "@/components/maps/CachedTileLayer";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function driverNavIcon(headingDeg = 0) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40' style='transform:rotate(${headingDeg}deg)'>
    <circle cx='20' cy='20' r='18' fill='#FBBF24' fill-opacity='0.3' stroke='#FBBF24' stroke-width='2'/>
    <path d='M12 16h16l2 6v8h-3v-2H13v2h-3v-8l2-6z' fill='#0A0A0A' stroke='#FBBF24' stroke-width='1'/>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function pinIcon(color, label) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='38' viewBox='0 0 32 42'>
    <path d='M16 0C7.16 0 0 7.16 0 16c0 11 16 26 16 26s16-15 16-26C32 7.16 24.84 0 16 0z' fill='${color}'/>
    <circle cx='16' cy='16' r='6' fill='#0A0A0A'/>
    <text x='16' y='19' text-anchor='middle' font-family='monospace' font-size='8' font-weight='900' fill='${color}'>${label}</text>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });
}

const REST_ICON = pinIcon("#B6F127", "R");
const CUST_ICON = pinIcon("#7DD3FC", "C");

function AnimatedDriver({ lat, lng, heading }) {
  const posRef = useRef({ lat, lng });
  const [pos, setPos] = useState({ lat, lng });

  useEffect(() => {
    const from = posRef.current;
    const to = { lat, lng };
    const start = performance.now();
    let raf = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 700);
      const ease = p * (2 - p);
      setPos({
        lat: from.lat + (to.lat - from.lat) * ease,
        lng: from.lng + (to.lng - from.lng) * ease,
      });
      if (p < 1) raf = requestAnimationFrame(tick);
      else posRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lat, lng]);

  return (
    <Marker position={[pos.lat, pos.lng]} icon={driverNavIcon(heading)}>
      <Popup>Your position</Popup>
    </Marker>
  );
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter(
      (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && !(p[0] === 0 && p[1] === 0)
    );
    if (!valid.length) return;
    if (valid.length === 1) map.setView(valid[0], 15);
    else map.fitBounds(valid, { padding: [56, 56], maxZoom: 16 });
  }, [map, points]);
  return null;
}

function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t = setTimeout(fix, 100);
    window.addEventListener("resize", fix);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}

function isValidMarker(m) {
  return m?.lat && m?.lng && Number.isFinite(m.lat) && Number.isFinite(m.lng) && !(m.lat === 0 && m.lng === 0);
}

export default function DriverNavigationMap({
  markers = [],
  routes = [],
  height = "100%",
  className = "",
}) {
  const points = useMemo(
    () => markers.filter(isValidMarker).map((m) => [m.lat, m.lng]),
    [markers]
  );
  const driver = markers.find((m) => m.type === "driver" && isValidMarker(m));
  const restaurant = markers.find((m) => m.type === "restaurant" && isValidMarker(m));
  const customer = markers.find((m) => m.type === "customer" && isValidMarker(m));
  const center = points[0] || [37.77, -122.42];
  const mapKey = `${driver?.lat ?? "d"}-${restaurant?.lat ?? "r"}-${customer?.lat ?? "c"}-${routes.length}`;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ height }}
      data-testid="driver-navigation-map"
    >
      <MapContainer
        key={mapKey}
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%", minHeight: 320 }}
        scrollWheelZoom
        zoomControl
      >
        <CachedTileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} />
        <MapResizeFix />
        {routes.map((r) => (
          <Polyline
            key={r.id}
            positions={r.points}
            pathOptions={{
              color: r.color || "#C2533B",
              weight: 5,
              opacity: 0.9,
              dashArray: r.kind === "pickup" ? "10 8" : undefined,
            }}
          />
        ))}
        {driver && (
          <AnimatedDriver
            lat={driver.lat}
            lng={driver.lng}
            heading={driver.meta?.heading_deg ?? 0}
          />
        )}
        {restaurant && (
          <Marker position={[restaurant.lat, restaurant.lng]} icon={REST_ICON}>
            <Popup>{restaurant.label || "Restaurant"}</Popup>
          </Marker>
        )}
        {customer && (
          <Marker position={[customer.lat, customer.lng]} icon={CUST_ICON}>
            <Popup>{customer.label || "Customer"}</Popup>
          </Marker>
        )}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
