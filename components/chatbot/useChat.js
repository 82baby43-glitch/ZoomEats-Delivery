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

export function useDreamlandChat(open, { skipSeed = false } = {}) {
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lastRecs, setLastRecs] = useState([]);
  const [session, setSession] = useState(null);
  const [refreshDismissed, setRefreshDismissed] = useState(false);
  const loadedFor = useRef(null);

  const loadSession = useCallback(async () => {
    try {
      const r = await api.get("/dreamland/session");
      setSession(r?.data || null);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    if (!open || loadedFor.current === "loaded") return;
    loadedFor.current = "loaded";
    (async () => {
      try {
        await loadSession();
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
        } else if (!skipSeed) {
          setMsgs(SEED);
        } else {
          setMsgs([]);
        }
      } catch (e) {
        console.warn("[dreamland] history load failed:", e);
        if (!skipSeed) setMsgs(SEED);
        else setMsgs([]);
      }
    })();
  }, [open, skipSeed, loadSession]);

  const send = useCallback(async (text, extra = {}) => {
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api.post("/dreamland/chat", { text, ...extra });
      const recs = Array.isArray(r?.data?.recommendations) ? r.data.recommendations : [];
      setLastRecs(recs);
      if (r?.data?.orders_since_refresh != null) {
        setSession((prev) => ({
          ...(prev || {}),
          orders_since_refresh: r.data.orders_since_refresh,
          show_refresh_prompt: r.data.show_refresh_prompt,
        }));
      }
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

  const refreshChat = useCallback(async () => {
    try {
      const r = await api.post("/dreamland/refresh", {});
      const seed = r?.data?.seed_message || DREAMLAND_SEED_MESSAGE;
      setMsgs([{ role: "assistant", text: seed }]);
      setLastRecs([]);
      setRefreshDismissed(false);
      await loadSession();
    } catch (e) {
      console.warn("[dreamland] refresh failed:", e);
    }
  }, [loadSession]);

  const showMore = useCallback(async (rec) => {
    const excludeRestaurants = lastRecs.map((r) => r.restaurant_id).filter(Boolean).join(",");
    const excludeItems = lastRecs.map((r) => r.menu_item_id).filter(Boolean).join(",");
    try {
      const r = await api.get("/dreamland/more", {
        params: {
          exclude_restaurants: excludeRestaurants,
          exclude_items: excludeItems,
          limit: "3",
        },
      });
      const recs = Array.isArray(r?.data?.recommendations) ? r.data.recommendations : [];
      if (!recs.length) return;
      setLastRecs((prev) => [...prev, ...recs]);
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: `Here are more Dreamland picks instead of ${rec?.restaurant_name || "that option"}:`,
          recommendations: recs,
        },
      ]);
    } catch (e) {
      console.warn("[dreamland] show more failed:", e);
    }
  }, [lastRecs]);

  const appendAssistant = useCallback((text, recommendations = []) => {
    setMsgs((m) => [...m, { role: "assistant", text, recommendations }]);
    if (recommendations.length) setLastRecs(recommendations);
  }, []);

  return {
    msgs,
    busy,
    send,
    lastRecs,
    session,
    refreshChat,
    showMore,
    refreshDismissed,
    setRefreshDismissed,
    appendAssistant,
  };
}

export const useChat = useDreamlandChat;
