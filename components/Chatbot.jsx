"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import ChatMessage from "@/components/chatbot/ChatMessage";
import ChatTyping from "@/components/chatbot/ChatTyping";
import ChatInput from "@/components/chatbot/ChatInput";
import { useChat } from "@/components/chatbot/useChat";

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const { msgs, busy, send } = useChat(open);
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 z-50"
        style={{ background: "var(--primary)", color: "#0A0A0A" }}
        data-testid="chatbot-toggle"
        aria-label="Open AI assistant"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 w-[360px] max-w-[calc(100vw-3rem)] h-[480px] border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            data-testid="chatbot-panel"
          >
            <div
              className="px-4 py-3 border-b"
              style={{ borderColor: "var(--border)", background: "var(--primary)", color: "#0A0A0A" }}
            >
              <div className="font-display font-black">Zoey · Food concierge</div>
              <div className="text-xs opacity-70">Powered by Claude · Tell me what you crave</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chatbot-messages">
              {msgs.map((m, i) => (
                <ChatMessage key={`${m.role}-${i}-${m.text.slice(0, 16)}`} message={m} />
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
