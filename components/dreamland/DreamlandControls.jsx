"use client";

import { useState } from "react";
import { RefreshCw, Clock, Star, Settings, X } from "lucide-react";
import DreamlandPreferencesModal from "./DreamlandPreferencesModal";

export default function DreamlandControls({ onRefresh, recentSessions = [] }) {
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <>
      <div className="relative">
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          onClick={() => setOpen((v) => !v)}
          data-testid="dreamland-menu-toggle"
          aria-label="Dreamland menu"
        >
          ⋯
        </button>
        {open && (
          <div
            className="absolute right-0 top-full mt-1 z-50 min-w-[12rem] rounded-xl border shadow-xl overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            data-testid="dreamland-menu"
          >
            <button type="button" className="w-full text-left px-3 py-2.5 text-xs hover:bg-black/20 flex items-center gap-2" onClick={() => { onRefresh?.(); setOpen(false); }}>
              <RefreshCw size={14} /> Start new chat
            </button>
            <div className="px-3 py-2 border-t text-[10px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              Recent chats
            </div>
            {recentSessions.slice(0, 3).map((s) => (
              <div key={s.session_id} className="px-3 py-1.5 text-xs flex items-center gap-2" style={{ color: "var(--muted)" }}>
                <Clock size={12} /> {s.mood?.replace(/_/g, " ") || "Session"}
              </div>
            ))}
            <button type="button" className="w-full text-left px-3 py-2.5 text-xs hover:bg-black/20 flex items-center gap-2 border-t" style={{ borderColor: "var(--border)" }} onClick={() => { setPrefsOpen(true); setOpen(false); }}>
              <Star size={14} /> Saved preferences
            </button>
            <button type="button" className="w-full text-left px-3 py-2.5 text-xs hover:bg-black/20 flex items-center gap-2" onClick={() => { setPrefsOpen(true); setOpen(false); }}>
              <Settings size={14} /> Dreamland settings
            </button>
          </div>
        )}
      </div>
      <DreamlandPreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </>
  );
}

export function DreamlandRefreshPrompt({ open, onRefresh, onContinue, onDismiss }) {
  if (!open) return null;
  return (
    <div className="rounded-xl border p-3 mb-2 text-xs" style={{ borderColor: "var(--primary)", background: "rgba(182,241,39,0.08)" }} data-testid="dreamland-refresh-prompt">
      <div className="flex items-start justify-between gap-2">
        <p>You&apos;ve completed 3 orders with Dreamland. Start a fresh food discovery session?</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss"><X size={14} /></button>
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" onClick={onRefresh}>Refresh chat</button>
        <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={onContinue}>Continue conversation</button>
      </div>
    </div>
  );
}
