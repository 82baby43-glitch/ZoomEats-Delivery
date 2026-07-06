"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { DREAMLAND_SEED_MESSAGE } from "@/lib/dreamland/prompts";

const SEED = [{ role: "assistant", text: DREAMLAND_SEED_MESSAGE }];

function normalizeHistoryMessage(text) {
  if (!text) return text;
  return text
    .replace(/Zoey/gi, "Dreamland")
    .replace(/food concierge/gi, "food guide")
    .replace(/Hey! I'm Dreamland 👋 What are you in the mood for tonight\?/i, DREAMLAND_SEED_MESSAGE);
}

export function useDreamlandChat(open) {
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lastRecs, setLastRecs] = useState([]);
  const loadedFor = useRef(null);

  useEffect(() => {
    if (!open || loadedFor.current === "loaded") return;
    loadedFor.current = "loaded";
    (async () => {
      try {
        const r = await api.get("/dreamland/history");
        const history = Array.isArray(r?.data) ? r.data : [];
        if (history.length) {
          setMsgs(history.map((m) => ({
            role: m?.role ?? "assistant",
            text: normalizeHistoryMessage(m?.text ?? ""),
            recommendations: m?.recommendations,
          })));
          const withRecs = [...history].reverse().find((m) => m?.recommendations?.length);
          if (withRecs) setLastRecs(withRecs.recommendations);
        } else {
          setMsgs(SEED);
        }
      } catch (e) {
        console.warn("[dreamland] history load failed:", e);
        setMsgs(SEED);
      }
    })();
  }, [open]);

  const send = useCallback(async (text) => {
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api.post("/dreamland/chat", { text });
      const recs = Array.isArray(r?.data?.recommendations) ? r.data.recommendations : [];
      setLastRecs(recs);
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: r?.data?.reply ?? "I had trouble responding. Try again?",
          recommendations: recs,
        },
      ]);
    } catch (e) {
      console.warn("[dreamland] send failed:", e);
      setMsgs((m) => [...m, { role: "assistant", text: "I had trouble responding. Try again?" }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const injectMessage = useCallback((text) => {
    if (!text) return;
    setMsgs((m) => [...m, { role: "assistant", text }]);
  }, []);

  return { msgs, busy, send, lastRecs, injectMessage };
}

// Backward-compatible alias
export const useChat = useDreamlandChat;
