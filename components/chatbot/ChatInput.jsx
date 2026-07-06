"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export default function ChatInput({ onSend, busy }) {
  const [input, setInput] = useState("");
  const submit = () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    onSend(t);
  };
  return (
    <div className="p-3 border-t flex gap-2" style={{ borderColor: "var(--border)" }}>
      <input
        className="input-field"
        placeholder="How are you feeling? What sounds good?"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        data-testid="chatbot-input"
      />
      <button className="btn-primary !px-3" onClick={submit} disabled={busy} data-testid="chatbot-send">
        <Send size={18} />
      </button>
    </div>
  );
}
