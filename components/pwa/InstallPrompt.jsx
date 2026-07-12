"use client";

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";
import { useInstallPrompt } from "@/lib/pwa/useInstallPrompt";
import { useAuth } from "@/lib/auth";

export default function InstallPrompt() {
  const { user } = useAuth();
  const { canPrompt, config, install, dismiss, iosHint, installed } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (canPrompt && user) {
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [canPrompt, user]);

  if (!visible || installed) return null;

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
        onClick={() => { dismiss(); setVisible(false); }}
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
      <div className="mt-4 flex gap-2">
        {iosHint ? (
          <p className="text-sm flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <Share size={16} /> Tap Share, then &quot;Add to Home Screen&quot;
          </p>
        ) : (
          <button type="button" className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={install}>
            <Download size={16} /> {config.installButton}
          </button>
        )}
        <button type="button" className="btn-ghost text-sm" onClick={() => { dismiss(); setVisible(false); }}>
          Not now
        </button>
      </div>
    </div>
  );
}
