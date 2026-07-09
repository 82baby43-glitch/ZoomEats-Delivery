"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILES = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
};

function pinIcon(color, label) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='36' viewBox='0 0 32 42'>
    <path d='M16 0C7.16 0 0 7.16 0 16c0 11 16 26 16 26s16-15 16-26C32 7.16 24.84 0 16 0z' fill='${color}'/>
    <circle cx='16' cy='16' r='6' fill='#0A0A0A'/>
    <text x='16' y='19' text-anchor='middle' font-family='monospace' font-size='8' font-weight='900' fill='${color}'>${label}</text>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });
}

const ICONS = {
  driver: pinIcon("#FBBF24", "D"),
  restaurant: pinIcon("#B6F127", "R"),
  customer: pinIcon("#7DD3FC", "C"),
  hotspot: pinIcon("#D49A36", "H"),
};

function hotspotCircle(level) {
  const color = level === "high" ? "#C2533B" : level === "medium" ? "#D49A36" : "#43614B";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='20' cy='20' r='18' fill='${color}' fill-opacity='0.35' stroke='${color}' stroke-width='2'/></svg>`;
  return new L.DivIcon({ html: svg, className: "", iconSize: [40, 40], iconAnchor: [20, 20] });
}

function AnimatedMarker({ marker, animate }) {
  const posRef = useRef({ lat: marker.lat, lng: marker.lng });
  const [pos, setPos] = useState({ lat: marker.lat, lng: marker.lng });

  useEffect(() => {
    if (!animate) {
      setPos({ lat: marker.lat, lng: marker.lng });
      return;
    }
    const from = posRef.current;
    const to = { lat: marker.lat, lng: marker.lng };
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
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
  }, [marker.lat, marker.lng, animate]);

  const icon = marker.type === "hotspot"
    ? hotspotCircle(String(marker.meta?.level || "medium"))
    : ICONS[marker.type] || ICONS.driver;

  return (
    <Marker position={[pos.lat, pos.lng]} icon={icon}>
      {marker.label && <Popup>{marker.label}</Popup>}
    </Marker>
  );
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!valid.length) return;
    if (valid.length === 1) map.setView(valid[0], 14);
    else map.fitBounds(valid, { padding: [48, 48], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function LogisticsMap({
  markers = [],
  routes = [],
  theme = "dark",
  height = 420,
  className = "",
  animateMarkers = true,
  showControls = true,
  onThemeChange,
}) {
  const containerRef = useRef(null);
  const [fs, setFs] = useState(false);
  const points = useMemo(
    () => markers.filter((m) => m.lat && m.lng).map((m) => [m.lat, m.lng]),
    [markers]
  );
  const center = points[0] || [37.77, -122.42];

  const toggleFs = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFs(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFs(false)).catch(() => {});
    }
  };

  if (!points.length) {
    return (
      <div className={`rounded-2xl border flex items-center justify-center text-sm ${className}`} style={{ borderColor: "var(--border)", height, color: "var(--muted)" }}>
        Waiting for GPS / order locations…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl overflow-hidden border relative ${className}`}
      style={{ borderColor: "var(--border)", height: fs ? "100vh" : height }}
      data-testid="logistics-map"
    >
      {showControls && (
        <div className="absolute top-3 right-3 z-[1000] flex gap-2">
          <button
            type="button"
            className="badge text-xs"
            onClick={() => onThemeChange?.(theme === "dark" ? "light" : "dark")}
            data-testid="logistics-map-theme-toggle"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button type="button" className="badge text-xs" onClick={toggleFs} data-testid="logistics-map-fullscreen">
            {fs ? "Exit" : "Fullscreen"}
          </button>
        </div>
      )}
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution='&copy; CARTO' url={TILES[theme]} />
        {routes.map((r) => (
          <Polyline
            key={r.id}
            positions={r.points}
            pathOptions={{ color: r.color || "#C2533B", weight: 4, opacity: 0.85, dashArray: r.kind === "pickup" ? "8 6" : undefined }}
          />
        ))}
        {markers.map((m) => (
          <AnimatedMarker key={m.id} marker={m} animate={animateMarkers && m.type === "driver"} />
        ))}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
