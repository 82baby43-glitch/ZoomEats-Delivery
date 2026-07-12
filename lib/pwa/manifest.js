import { getPwaConfig } from "./appContext";

export function buildWebManifest(appType = "customer", origin = "https://zoomeats.com") {
  const cfg = getPwaConfig(appType);
  const base = origin.replace(/\/$/, "");

  return {
    id: `${cfg.id}-pwa`,
    name: cfg.name,
    short_name: cfg.shortName,
    description: "Curated food delivery — eat well, delivered fast.",
    start_url: cfg.startUrl,
    scope: cfg.scope,
    display: "standalone",
    orientation: "portrait-primary",
    background_color: cfg.backgroundColor,
    theme_color: cfg.themeColor,
    categories: ["food", "shopping", "lifestyle"],
    icons: [
      {
        src: `${base}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/icons/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [],
  };
}
