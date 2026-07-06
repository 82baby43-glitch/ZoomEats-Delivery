"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function severityColor(severity) {
  if (severity === "critical") return "var(--primary)";
  if (severity === "warning") return "#eab308";
  return "var(--muted)";
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState({ email_enabled: true, sms_enabled: false, phone: "", email: "" });
  const ref = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get("/notifications");
      setItems(Array.isArray(res?.data?.notifications) ? res.data.notifications : []);
      setUnread(Number(res?.data?.unread_count || 0));
    } catch (e) {
      console.warn(e);
    }
  }, [user]);

  const loadPrefs = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get("/notifications/preferences");
      setPrefs({
        email_enabled: res?.data?.email_enabled ?? true,
        sms_enabled: res?.data?.sms_enabled ?? false,
        phone: res?.data?.phone || "",
        email: res?.data?.email || "",
      });
    } catch (e) {
      console.warn(e);
    }
  }, [user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`, {});
      await load();
    } catch (e) {
      console.warn(e);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read-all", {});
      await load();
    } catch (e) {
      console.warn(e);
    }
  };

  const savePrefs = async () => {
    try {
      await api.put("/notifications/preferences", prefs);
      setPrefsOpen(false);
    } catch {
      alert("Could not save preferences");
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative p-2 rounded-lg hover:opacity-80"
        style={{ background: "var(--surface-2)" }}
        onClick={() => { setOpen((v) => !v); if (!open) loadPrefs(); }}
        aria-label="Notifications"
        data-testid="notification-bell"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: "var(--primary)", color: "#0A0A0A" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[min(92vw,380px)] rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="font-bold">Notifications</div>
            <div className="flex items-center gap-2">
              <button type="button" className="text-xs font-bold" style={{ color: "var(--muted)" }} onClick={() => setPrefsOpen((v) => !v)}>
                <Settings size={14} />
              </button>
              {unread > 0 && (
                <button type="button" className="text-xs font-bold" style={{ color: "var(--primary)" }} onClick={markAllRead}>
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {prefsOpen ? (
            <div className="p-4 space-y-3 text-sm">
              <div className="font-bold">Notification preferences</div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={prefs.email_enabled} onChange={(e) => setPrefs((p) => ({ ...p, email_enabled: e.target.checked }))} />
                Email ({prefs.email || "account email"})
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={prefs.sms_enabled} onChange={(e) => setPrefs((p) => ({ ...p, sms_enabled: e.target.checked }))} />
                SMS alerts
              </label>
              <input
                className="input-field w-full"
                placeholder="Phone (+1...)"
                value={prefs.phone}
                onChange={(e) => setPrefs((p) => ({ ...p, phone: e.target.value }))}
              />
              <button type="button" className="btn-primary w-full" onClick={savePrefs}>Save preferences</button>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-6 text-center text-sm" style={{ color: "var(--muted)" }}>No notifications yet.</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.notification_id}
                    type="button"
                    className="w-full text-left px-4 py-3 border-b hover:opacity-90"
                    style={{
                      borderColor: "var(--border)",
                      background: n.read_at ? "transparent" : "var(--surface-2)",
                    }}
                    onClick={() => {
                      markRead(n.notification_id);
                      if (n.action_url) window.location.href = n.action_url;
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: severityColor(n.severity) }} />
                      <div>
                        <div className="font-bold text-sm">{n.title}</div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{n.body}</div>
                        <div className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                          {n.email_sent_at ? " · Email sent" : ""}
                          {n.sms_sent_at ? " · SMS sent" : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
