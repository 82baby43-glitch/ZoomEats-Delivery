"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

function markerIcon(marker, pinIcon, hotspotCircle) {
  if (marker.type === "hotspot") {
    return hotspotCircle(String(marker.meta?.level || "medium"));
  }
  const colors = { driver: "#FBBF24", restaurant: "#B6F127", customer: "#7DD3FC", hotspot: "#D49A36" };
  const labels = { driver: "D", restaurant: "R", customer: "C", hotspot: "H" };
  const color = colors[marker.type] || colors.driver;
  const label = labels[marker.type] || "D";
  return pinIcon(color, label);
}

export function MarkerClusterLayer({ markers, pinIcon, hotspotCircle }) {
  const map = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    if (!markers.length) return undefined;

    const group = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 52,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 16,
    });

    for (const m of markers) {
      if (!m.lat || !m.lng) continue;
      const icon = markerIcon(m, pinIcon, hotspotCircle);
      const lm = L.marker([m.lat, m.lng], { icon });
      if (m.label) lm.bindPopup(m.label);
      group.addLayer(lm);
    }

    map.addLayer(group);
    groupRef.current = group;

    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map, markers, pinIcon, hotspotCircle]);

  return null;
}

export function MapRotateControl({ bearing, onBearingChange }) {
  const map = useMap();

  useEffect(() => {
    const pane = map.getPane("mapPane");
    if (!pane) return;
    pane.style.transformOrigin = "50% 50%";
    pane.style.transition = "transform 0.25s ease";
    pane.style.transform = `rotate(${bearing}deg)`;
  }, [map, bearing]);

  return (
    <div className="absolute bottom-3 left-3 z-[1000] flex gap-1">
      <button
        type="button"
        className="badge text-xs"
        onClick={() => onBearingChange((b) => (b - 15 + 360) % 360)}
        data-testid="logistics-map-rotate-left"
        aria-label="Rotate map left"
      >
        ↺
      </button>
      <button
        type="button"
        className="badge text-xs min-w-[2.5rem]"
        onClick={() => onBearingChange(0)}
        data-testid="logistics-map-rotate-reset"
        aria-label="Reset map rotation"
      >
        {bearing}°
      </button>
      <button
        type="button"
        className="badge text-xs"
        onClick={() => onBearingChange((b) => (b + 15) % 360)}
        data-testid="logistics-map-rotate-right"
        aria-label="Rotate map right"
      >
        ↻
      </button>
    </div>
  );
}
