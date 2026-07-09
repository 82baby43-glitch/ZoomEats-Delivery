"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { fetchTileWithCache, revokeTileObjectUrl } from "@/lib/maps/tileCache";

export function CachedTileLayer({ url, attribution }) {
  const map = useMap();

  useEffect(() => {
    const Layer = L.TileLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement("img");
        tile.alt = "";
        tile.setAttribute("role", "presentation");
        const src = (this).getTileUrl(coords);
        let objectUrl = null;

        fetchTileWithCache(src)
          .then((resolved) => {
            objectUrl = resolved;
            tile.src = resolved;
            tile.onload = () => {
              done(null, tile);
            };
            tile.onerror = () => {
              if (objectUrl && objectUrl !== src) revokeTileObjectUrl(objectUrl);
              tile.src = src;
              done(null, tile);
            };
          })
          .catch(() => {
            tile.src = src;
            tile.onload = () => done(null, tile);
            tile.onerror = () => done(new Error("tile load failed"), tile);
          });

        return tile;
      },
    });

    const layer = new Layer(url, { attribution, maxZoom: 19 });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, url, attribution]);

  return null;
}
