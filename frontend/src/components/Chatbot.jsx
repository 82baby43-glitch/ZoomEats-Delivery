import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send } from "lucide-react";
import { api } from "@/lib/api";

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await api.get("/chat/history");
        if (r.data.length) {
          setMsgs(r.data.map((m) => ({ role: m.role, text: m.text })));
        } else {
          setMsgs([{ role: "assistant", text: "Hey! I'm Zoey 👋 What are you in the mood for tonight?" }]);
        }
      } catch {
        setMsgs([{ role: "assistant", text: "Hey! I'm Zoey. Sign in to save our chats — meanwhile, ask away!" }]);
      }
    })();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api.post("/chat", { text });
      setMsgs((m) => [...m, { role: "assistant", text: r.data.reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: "I had trouble responding. Try again?" }]);
    } finally {
      setBusy(false);
    }
  };

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
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--primary)", color: "#0A0A0A" }}>
              <div className="font-display font-black">Zoey · Food concierge</div>
              <div className="text-xs opacity-70">Powered by Claude · Tell me what you crave</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chatbot-messages">
              {msgs.map((m, i) => (
                  <div
                    key={`${m.role}-${i}-${m.text.slice(0, 16)}`}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                  <div
                    className="max-w-[85%] px-3 py-2 rounded-2xl text-sm"
                    style={
                      m.role === "user"
                        ? { background: "var(--primary)", color: "#0A0A0A" }
                        : { background: "var(--surface-2)", color: "var(--text)" }
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-2xl text-sm" style={{ background: "var(--surface-2)" }}>
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "0.1s" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "0.2s" }} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="p-3 border-t flex gap-2" style={{ borderColor: "var(--border)" }}>
              <input
                className="input-field"
                placeholder="What should I eat tonight?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                data-testid="chatbot-input"
              />
              <button className="btn-primary !px-3" onClick={send} disabled={busy} data-testid="chatbot-send">
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
