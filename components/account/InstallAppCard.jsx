"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/lib/pwa/useInstallPrompt";

export default function InstallAppCard({ compact = false }) {
  const {
    canShowInstall,
    config,
    install,
    iosHint,
    installed,
    canNativeInstall,
    openInstallPrompt,
  } = usePwaInstall();

  if (installed || !canShowInstall) return null;

  const onInstall = async () => {
    if (canNativeInstall) {
      await install();
      return;
    }
    openInstallPrompt();
  };

  return (
    <div className={`card ${compact ? "p-4" : "p-5"}`} data-testid="install-app-card">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-lg"
          style={{ background: "var(--primary)", color: "#0A0A0A" }}
        >
          Z
        </div>
        <div className="min-w-0">
          <p className="font-bold">{config.installButton}</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {config.installTitle}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {iosHint ? (
          <p className="text-sm flex items-start gap-2" style={{ color: "var(--muted)" }}>
            <Share size={16} className="shrink-0 mt-0.5" />
            Tap the Share button in Safari, then choose &quot;Add to Home Screen&quot;.
          </p>
        ) : canNativeInstall ? (
          <button
            type="button"
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={onInstall}
            data-testid="install-app-card-button"
          >
            <Download size={16} /> {config.installButton}
          </button>
        ) : (
          <div className="text-sm space-y-2" style={{ color: "var(--muted)" }}>
            <p className="flex items-start gap-2">
              <Smartphone size={16} className="shrink-0 mt-0.5" />
              Open your browser menu (⋮) and choose <strong className="text-white">Add to Home screen</strong> or <strong className="text-white">Install app</strong>.
            </p>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              onClick={openInstallPrompt}
            >
              Show install reminder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
