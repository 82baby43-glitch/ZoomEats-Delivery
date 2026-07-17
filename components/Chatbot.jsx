"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle } from "lucide-react";
import ChatMessage from "@/components/chatbot/ChatMessage";
import ChatTyping from "@/components/chatbot/ChatTyping";
import ChatInput from "@/components/chatbot/ChatInput";
import DreamlandAvatar from "@/components/dreamland/DreamlandAvatar";
import DreamlandChatHub from "@/components/dreamland/DreamlandChatHub";
import DreamlandControls, { DreamlandRefreshPrompt } from "@/components/dreamland/DreamlandControls";
import { DREAMLAND_CHAT_SUBTITLE } from "@/lib/dreamland/prompts";
import { useDreamlandChat } from "@/components/chatbot/useChat";
import { useAuth } from "@/lib/auth";

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [selectedMood, setSelectedMood] = useState(null);
  const { user } = useAuth();
  const {
    msgs,
    busy,
    send,
    appendAssistant,
    session,
    refreshChat,
    showMore,
    refreshDismissed,
    setRefreshDismissed,
  } = useDreamlandChat(open, { skipSeed: !!user });
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, open]);

  const handleMood = useCallback((mood, label, moodUiId) => {
    setSelectedMood(moodUiId || mood);
    const text = label.replace(/[^\w\s]/g, "").trim() || mood.replace(/_/g, " ");
    send(`I'm feeling ${text.toLowerCase()}`, { mood_ui_id: moodUiId });
  }, [send]);

  const handleSurprise = useCallback((data) => {
    if (!data?.message) return;
    const text = String(data.message).replace(/\*\*/g, "");
    const recs = data.surprise ? [data.surprise] : [];
    appendAssistant(text, recs);
  }, [appendAssistant]);

  return (
    <>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg z-50 border-0 cursor-pointer"
        style={{
          background: "var(--primary)",
          color: "#0A0A0A",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(182, 241, 39, 0.2)",
        }}
        whileHover={{
          scale: 1.05,
          background: "var(--primary-hover)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 4px rgba(182, 241, 39, 0.18)",
        }}
        whileTap={{ scale: 0.96 }}
        data-testid="chatbot-toggle"
        aria-label="Open Dreamland chat"
      >
        {open ? <X size={24} strokeWidth={2.5} /> : <MessageCircle size={24} strokeWidth={2.5} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed bottom-24 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[560px] border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
            data-testid="chatbot-panel"
          >
            <div
              className="px-4 py-3 border-b flex items-center gap-3 shrink-0"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-2)",
              }}
            >
              <DreamlandAvatar size={36} pulse />
              <div className="flex-1 min-w-0">
                <div className="font-display font-black">Dreamland</div>
                <div className="text-xs opacity-70 truncate">{DREAMLAND_CHAT_SUBTITLE}</div>
              </div>
              {user && (
                <DreamlandControls
                  onRefresh={refreshChat}
                  recentSessions={session?.recent_sessions || []}
                />
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chatbot-messages">
              {user && (
                <>
                  <DreamlandRefreshPrompt
                    open={Boolean(session?.show_refresh_prompt && !refreshDismissed)}
                    onRefresh={refreshChat}
                    onContinue={() => setRefreshDismissed(true)}
                    onDismiss={() => setRefreshDismissed(true)}
                  />
                  <DreamlandChatHub
                    onAfterMood={handleMood}
                    onAfterSurprise={handleSurprise}
                    onShowMore={showMore}
                    selectedMood={selectedMood}
                  />
                </>
              )}
              {msgs.map((m, i) => (
                <ChatMessage key={`${m.role}-${i}-${m.text.slice(0, 16)}`} message={m} onShowMore={showMore} />
              ))}
              {busy && <ChatTyping />}
              <div ref={endRef} />
            </div>
            <ChatInput onSend={send} busy={busy} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export { Chatbot as DreamlandChat };
