"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Navigation } from "lucide-react";
import {
  buildAppleMapsDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
  buildWazeNavigationUrl,
} from "@/lib/logistics/externalNavigation";

function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function ExternalNavigationButtons({ destination, origin }) {
  const [showAppleMaps, setShowAppleMaps] = useState(false);

  useEffect(() => {
    setShowAppleMaps(isAppleDevice());
  }, []);

  const links = useMemo(() => {
    if (!destination) return [];
    const items = [
      {
        id: "google",
        label: "Google Maps",
        url: buildGoogleMapsDirectionsUrl(destination, origin),
        testId: "nav-open-google-maps",
      },
      {
        id: "waze",
        label: "Waze",
        url: buildWazeNavigationUrl(destination),
        testId: "nav-open-waze",
      },
    ];
    if (showAppleMaps) {
      items.push({
        id: "apple",
        label: "Apple Maps",
        url: buildAppleMapsDirectionsUrl(destination, origin),
        testId: "nav-open-apple-maps",
      });
    }
    return items.filter((item) => item.url);
  }, [destination, origin, showAppleMaps]);

  if (!links.length) return null;

  return (
    <div className="space-y-2" data-testid="external-navigation-buttons">
      <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--muted)" }}>
        <Navigation size={12} /> Turn-by-turn navigation
      </div>
      <div className="flex flex-col gap-2">
        {links.map((link, index) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={index === 0 ? "btn-primary !py-3 flex items-center justify-center gap-2 text-sm" : "btn-secondary !py-3 flex items-center justify-center gap-2 text-sm"}
            data-testid={link.testId}
          >
            Open in {link.label}
            <ExternalLink size={14} />
          </a>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Opens your preferred maps app for voice-guided driving directions. ZoomEats keeps tracking your delivery in the background.
      </p>
    </div>
  );
}
