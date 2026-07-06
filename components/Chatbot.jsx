"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import ChatMessage from "@/components/chatbot/ChatMessage";
import ChatTyping from "@/components/chatbot/ChatTyping";
import ChatInput from "@/components/chatbot/ChatInput";
import DreamlandAvatar from "@/components/dreamland/DreamlandAvatar";
import { useDreamlandChat } from "@/components/chatbot/useChat";

export default function Chatbot({ initialMessage }) {
  const [open, setOpen] = useState(false);
  const { msgs, busy, send, injectMessage } = useDreamlandChat(open);
  const endRef = useRef();
  const injected = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (open && initialMessage && !injected.current) {
      injected.current = true;
      injectMessage(initialMessage);
    }
  }, [open, initialMessage, injectMessage]);

  return (
    <>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-50"
        style={{
          background: "linear-gradient(135deg, #c4b5fd 0%, #f9a8d4 55%, #fcd34d 100%)",
          color: "#1a1025",
        }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        data-testid="chatbot-toggle"
        aria-label="Open Dreamland"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed bottom-24 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[520px] border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
            style={{
              background: "var(--surface)",
              borderColor: "rgba(167,139,250,0.25)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 0 40px rgba(167,139,250,0.08)",
            }}
            data-testid="chatbot-panel"
          >
            <div
              className="px-4 py-3 border-b flex items-center gap-3"
              style={{
                borderColor: "rgba(167,139,250,0.2)",
                background: "linear-gradient(90deg, rgba(167,139,250,0.2) 0%, rgba(249,168,212,0.12) 100%)",
              }}
            >
              <DreamlandAvatar size={36} pulse />
              <div>
                <div className="font-display font-black">Dreamland</div>
                <div className="text-xs opacity-70">Your emotionally intelligent food guide</div>
              </div>
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

// Backward-compatible export name
export { Chatbot as DreamlandChat };
