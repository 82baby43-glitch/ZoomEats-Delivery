import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom neon pin icons (no external image assets — pure SVG data URIs)
function pinIcon(color, label) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='42' viewBox='0 0 32 42'>
    <path d='M16 0C7.16 0 0 7.16 0 16c0 11 16 26 16 26s16-15 16-26C32 7.16 24.84 0 16 0z' fill='${color}'/>
    <circle cx='16' cy='16' r='6' fill='#0A0A0A'/>
    <text x='16' y='19' text-anchor='middle' font-family='monospace' font-size='9' font-weight='900' fill='${color}'>${label}</text>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
  });
}

const REST_ICON = pinIcon("#B6F127", "R");
const CUST_ICON = pinIcon("#7DD3FC", "C");
const DRIVER_ICON = pinIcon("#FBBF24", "D");

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView(valid[0], 15);
    } else {
      map.fitBounds(valid, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, points]);
  return null;
}

/**
 * Live tracking map. Driver pin animates as drivers.latitude/longitude updates.
 *
 * @param {object} restaurant - { latitude, longitude, name }
 * @param {object} customer   - { latitude, longitude } (optional — falls back to restaurant if unknown)
 * @param {object} driver     - { latitude, longitude, last_seen } (optional)
 */
export default function LiveMap({ restaurant, customer, driver }) {
  const restPt = useMemo(
    () => (restaurant?.latitude && restaurant?.longitude ? [restaurant.latitude, restaurant.longitude] : null),
    [restaurant?.latitude, restaurant?.longitude]
  );
  const custPt = useMemo(
    () => (customer?.latitude && customer?.longitude ? [customer.latitude, customer.longitude] : null),
    [customer?.latitude, customer?.longitude]
  );
  const drvPt = useMemo(
    () => (driver?.latitude && driver?.longitude ? [driver.latitude, driver.longitude] : null),
    [driver?.latitude, driver?.longitude]
  );

  const points = [restPt, custPt, drvPt].filter(Boolean);
  if (points.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{ borderColor: "var(--border)", height: 320 }}
      data-testid="live-map"
    >
      <MapContainer
        center={points[0]}
        zoom={14}
        style={{ height: "100%", width: "100%", background: "#0A0A0A" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
        />
        {restPt && (
          <Marker position={restPt} icon={REST_ICON}>
            <Popup>{restaurant.name || "Restaurant"}</Popup>
          </Marker>
        )}
        {custPt && (
          <Marker position={custPt} icon={CUST_ICON}>
            <Popup>Dropoff</Popup>
          </Marker>
        )}
        {drvPt && (
          <Marker position={drvPt} icon={DRIVER_ICON}>
            <Popup>
              Driver{driver?.last_seen ? ` · seen ${new Date(driver.last_seen).toLocaleTimeString()}` : ""}
            </Popup>
          </Marker>
        )}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
