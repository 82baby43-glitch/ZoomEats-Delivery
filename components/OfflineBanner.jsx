"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();

    const onOffline = () => setOffline(true);
    const onOnline = async () => {
      setOffline(false);
      setReconnected(true);
      try {
        await supabase.auth.getSession();
        supabase.realtime.connect();
      } catch {
        // Session refresh will retry on next request
      }
      setTimeout(() => setReconnected(false), 4000);
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!offline && !reconnected) return null;

  return (
    <div
      className="px-4 py-2 text-sm text-center font-medium"
      role="status"
      aria-live="polite"
      style={{
        background: offline ? "rgba(251,191,36,0.15)" : "rgba(34,197,94,0.15)",
        color: offline ? "#fbbf24" : "#4ade80",
        borderBottom: `1px solid ${offline ? "rgba(251,191,36,0.3)" : "rgba(34,197,94,0.3)"}`,
      }}
    >
      {offline
        ? "You are offline. Some features will return when connection is restored."
        : "Connection restored. Syncing…"}
    </div>
  );
}
