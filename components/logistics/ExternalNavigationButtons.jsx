"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Navigation } from "lucide-react";
import { buildExternalNavLinks } from "@/lib/logistics/externalNavigation";
import { useExternalNavHandoff } from "@/lib/hooks/useExternalNavHandoff";

function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function ExternalNavigationButtons({ destination, origin, orderId }) {
  const [showAppleMaps, setShowAppleMaps] = useState(false);
  const { openNavigation, isMobile } = useExternalNavHandoff(orderId);

  useEffect(() => {
    setShowAppleMaps(isAppleDevice());
  }, []);

  const links = useMemo(
    () => buildExternalNavLinks(destination, origin, { includeApple: showAppleMaps }),
    [destination, origin, showAppleMaps]
  );

  if (!links.length) return null;

  return (
    <div className="space-y-2" data-testid="external-navigation-buttons">
      <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--muted)" }}>
        <Navigation size={12} /> Turn-by-turn navigation
      </div>

      <div className="flex flex-col gap-2">
        {links.map((link, index) => (
          <button
            key={link.id}
            type="button"
            onClick={() =>
              openNavigation({
                provider: link.id,
                webUrl: link.webUrl,
                nativeUrl: link.nativeUrl,
              })
            }
            className={index === 0 ? "btn-primary !py-3 flex items-center justify-center gap-2 text-sm" : "btn-secondary !py-3 flex items-center justify-center gap-2 text-sm"}
            data-testid={`nav-open-${link.id}`}
          >
            Open in {link.label}
            <ExternalLink size={14} />
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {isMobile
          ? "Opens your maps app for voice guidance. ZoomEats keeps tracking in the background while you drive."
          : "Opens your preferred maps app for voice-guided driving directions. ZoomEats keeps tracking your delivery in the background."}
      </p>
    </div>
  );
}
