"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Bell } from "lucide-react";

export default function SpotlightNotificationPrefs() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.get("/spotlight/notifications/preferences");
        setEnabled(Boolean(res?.data?.enabled));
      } finally {
        setLoaded(true);
      }
    })();
  }, [user]);

  if (!user || !loaded) return null;

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await api.put("/spotlight/notifications/preferences", { enabled: next });
  };

  return (
    <div
      className="fixed bottom-28 right-6 z-40 card p-3 max-w-xs shadow-lg"
      data-testid="spotlight-notification-prefs"
    >
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={toggle} className="mt-1" />
        <span>
          <span className="font-bold flex items-center gap-1"><Bell size={14} /> Local partner alerts</span>
          <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>
            Get notified when a new Local Partner Spotlight goes live.
          </span>
        </span>
      </label>
    </div>
  );
}
