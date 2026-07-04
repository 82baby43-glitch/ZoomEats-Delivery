import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

const SEED = [{ role: "assistant", text: "Hey! I'm Zoey 👋 What are you in the mood for tonight?" }];

export function useChat(open) {
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const loadedFor = useRef(null);

  useEffect(() => {
    if (!open || loadedFor.current === "loaded") return;
    loadedFor.current = "loaded";
    (async () => {
      try {
        const r = await api.get("/chat/history");
        const history = Array.isArray(r?.data) ? r.data : [];
        setMsgs(history.length ? history.map((m) => ({ role: m?.role ?? "assistant", text: m?.text ?? "" })) : SEED);
      } catch (e) {
        console.warn("[chat] history load failed:", e);
        setMsgs(SEED);
      }
    })();
  }, [open]);

  const send = useCallback(async (text) => {
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api.post("/chat", { text });
      setMsgs((m) => [...m, { role: "assistant", text: r?.data?.reply ?? "I had trouble responding. Try again?" }]);
    } catch (e) {
      console.warn("[chat] send failed:", e);
      setMsgs((m) => [...m, { role: "assistant", text: "I had trouble responding. Try again?" }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { msgs, busy, send };
}
