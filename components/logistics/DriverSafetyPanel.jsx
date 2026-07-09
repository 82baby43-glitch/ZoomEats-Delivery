"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Shield, AlertTriangle } from "lucide-react";

export default function DriverSafetyPanel({ position, activeOrderId }) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [eventId, setEventId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [emergencySent, setEmergencySent] = useState(false);
  const [error, setError] = useState("");

  const loadThread = useCallback(async () => {
    try {
      const res = await api.get("/logistics/safety/support");
      const data = res?.data ?? res;
      setEventId(data?.event_id ?? null);
      setMessages(data?.messages ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (supportOpen) loadThread();
  }, [supportOpen, loadThread]);

  const payload = () => ({
    latitude: position?.lat,
    longitude: position?.lng,
    order_id: activeOrderId || undefined,
  });

  const sendEmergency = async () => {
    if (!window.confirm("Send emergency alert to ZoomEats support?")) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/logistics/safety/emergency", {
        ...payload(),
        message: "Driver emergency — immediate assistance requested",
      });
      setEmergencySent(true);
    } catch (e) {
      setError(e?.message || "Could not send emergency alert");
    } finally {
      setLoading(false);
    }
  };

  const sendSupport = async () => {
    const text = draft.trim();
    if (!text) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/logistics/safety/support", {
        ...payload(),
        event_id: eventId,
        message: text,
      });
      const data = res?.data ?? res;
      setEventId(data?.event_id ?? eventId);
      setMessages(data?.messages ?? []);
      setDraft("");
      setSupportOpen(true);
    } catch (e) {
      setError(e?.message || "Could not send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-4">
      <h2 className="font-bold flex items-center gap-2 mb-2"><Shield size={16} /> Safety</h2>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {emergencySent && (
        <p className="text-xs mb-2" style={{ color: "var(--accent)" }}>Emergency alert sent — support notified.</p>
      )}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="btn-secondary text-xs w-full"
          onClick={() => setSupportOpen((v) => !v)}
          data-testid="safety-support"
        >
          {supportOpen ? "Hide support chat" : "Support chat"}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs w-full text-red-400 border-red-400/30"
          onClick={sendEmergency}
          disabled={loading || emergencySent}
          data-testid="safety-emergency"
        >
          <span className="inline-flex items-center gap-1 justify-center w-full">
            <AlertTriangle size={14} /> Emergency
          </span>
        </button>
      </div>

      {supportOpen && (
        <div className="mt-3 border rounded-xl p-2 space-y-2" style={{ borderColor: "var(--border)" }} data-testid="safety-support-thread">
          <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
            {messages.length === 0 && (
              <p style={{ color: "var(--muted)" }}>Start a conversation with support.</p>
            )}
            {messages.map((m) => (
              <div key={m.message_id} className={m.sender_role === "driver" ? "text-right" : ""}>
                <span className="badge">{m.sender_role}</span>
                <div className="mt-0.5">{m.body}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              className="input-field text-xs flex-1 py-1"
              placeholder="Message support…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendSupport()}
              data-testid="safety-support-input"
            />
            <button type="button" className="btn-primary text-xs px-2" onClick={sendSupport} disabled={loading}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
