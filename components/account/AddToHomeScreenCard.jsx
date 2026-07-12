"use client";

import { Share, Smartphone } from "lucide-react";
import { getClientAppType, getPwaConfig, isIosSafari, isMobileDevice, isStandaloneMode } from "@/lib/pwa/appContext";

export default function AddToHomeScreenCard() {
  if (typeof window !== "undefined" && isStandaloneMode()) return null;
  if (typeof window !== "undefined" && !isMobileDevice()) return null;

  const config = getPwaConfig(getClientAppType());
  const ios = isIosSafari();

  return (
    <div className="card p-5" data-testid="add-to-home-screen-card">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-lg"
          style={{ background: "var(--primary)", color: "#0A0A0A" }}
        >
          Z
        </div>
        <div className="min-w-0">
          <p className="font-bold">Add {config.shortName} to your home screen</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Open ZoomEats from your home screen for faster access — no app store download needed.
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-2 text-sm list-decimal list-inside" style={{ color: "var(--muted)" }}>
        <li>Open <strong className="text-white">ZoomEats in your phone browser</strong> (Safari or Chrome).</li>
        {ios ? (
          <li className="flex items-start gap-2 list-none -ml-0">
            <Share size={16} className="shrink-0 mt-0.5" />
            <span>Tap <strong className="text-white">Share</strong>, then <strong className="text-white">Add to Home Screen</strong>.</span>
          </li>
        ) : (
          <li className="flex items-start gap-2 list-none -ml-0">
            <Smartphone size={16} className="shrink-0 mt-0.5" />
            <span>Tap the browser menu <strong className="text-white">(⋮)</strong>, then <strong className="text-white">Add to Home screen</strong>.</span>
          </li>
        )}
        <li>Launch {config.shortName} from your home screen like an app.</li>
      </ol>
    </div>
  );
}
