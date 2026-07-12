"use client";

import { useEffect, useState } from "react";
import { getClientAppType, getPwaConfig } from "@/lib/pwa/appContext";

export default function AppSplash() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShow(false), 900);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const cfg = getPwaConfig(getClientAppType());

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: cfg.backgroundColor }}
      aria-hidden="true"
      data-testid="pwa-splash"
    >
      <div
        className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl font-black"
        style={{ background: cfg.themeColor, color: "#0A0A0A" }}
      >
        Z
      </div>
      <p className="mt-6 font-display text-2xl font-bold text-white">{cfg.name}</p>
      <div
        className="mt-8 w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
        style={{ borderColor: cfg.themeColor, borderTopColor: "transparent" }}
      />
    </div>
  );
}
