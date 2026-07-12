"use client";

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";
import { usePwaInstall } from "@/lib/pwa/useInstallPrompt";
import { useAuth } from "@/lib/auth";

export default function InstallPrompt() {
  const { user } = useAuth();
  const {
    canShowInstall,
    canAutoPrompt,
    canNativeInstall,
    config,
    install,
    snooze,
    iosHint,
    installed,
    manualOpen,
  } = usePwaInstall();
  const [autoVisible, setAutoVisible] = useState(false);

  useEffect(() => {
    if (canAutoPrompt && user && !manualOpen) {
      const t = setTimeout(() => setAutoVisible(true), 1200);
      return () => clearTimeout(t);
    }
    setAutoVisible(false);
  }, [canAutoPrompt, user, manualOpen]);

  const visible = Boolean(user) && canShowInstall && !installed && (manualOpen || autoVisible);
  if (!visible) return null;

  const close = () => {
    snooze();
    setAutoVisible(false);
  };

  return (
    <div
      className="fixed inset-x-4 bottom-20 md:bottom-6 z-50 max-w-md mx-auto card p-4 shadow-2xl border"
      style={{ borderColor: "var(--border)", background: "rgba(10,10,10,0.96)" }}
      role="dialog"
      aria-label="Install app"
      data-testid="pwa-install-prompt"
    >
      <button
        type="button"
        className="absolute top-3 right-3 btn-ghost p-1"
        onClick={close}
        aria-label="Dismiss"
      >
        <X size={18} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl" style={{ background: "var(--primary)", color: "#0A0A0A" }}>Z</div>
        <div>
          <p className="font-bold">{config.installButton}</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{config.installTitle}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        {iosHint ? (
          <p className="text-sm flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <Share size={16} /> Tap Share, then &quot;Add to Home Screen&quot;
          </p>
        ) : canNativeInstall ? (
          <button type="button" className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={install}>
            <Download size={16} /> {config.installButton}
          </button>
        ) : (
          <p className="text-sm flex-1" style={{ color: "var(--muted)" }}>
            Open your browser menu (⋮) and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.
          </p>
        )}
        <button type="button" className="btn-ghost text-sm" onClick={close}>
          Not now
        </button>
      </div>
    </div>
  );
}
