"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MessageSquare, Send } from "lucide-react";

const CANNED = [
  "Your order is being prepared.",
  "We're running a few minutes behind — thanks for your patience.",
  "Your order is ready for pickup.",
  "Please come to the counter for your order.",
  "We've contacted support about your order.",
];

export default function RestaurantMessaging() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const loadConversations = async () => {
    const res = await api.get("/vendor/messages/conversations");
    const list = Array.isArray(res?.data) ? res.data : [];
    setConversations(list);
    if (!activeId && list[0]) setActiveId(list[0].conversation_id);
  };

  const loadMessages = async (id) => {
    if (!id) return;
    const res = await api.get(`/vendor/messages/conversations/${id}`);
    setMessages(Array.isArray(res?.data) ? res.data : []);
  };

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  const send = async (body, isCanned = false) => {
    if (!activeId || !body.trim()) return;
    await api.post(`/vendor/messages/conversations/${activeId}`, { body, is_canned: isCanned });
    setDraft("");
    await loadMessages(activeId);
    await loadConversations();
  };

  const startSupportChat = async () => {
    const res = await api.post("/vendor/messages/conversations", {
      participant_type: "support",
      participant_name: "ZoomEats Support",
    });
    const conv = res?.data || res;
    await loadConversations();
    setActiveId(conv.conversation_id);
  };

  if (loading) {
    return <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>Loading messages…</div>;
  }

  return (
    <div className="grid md:grid-cols-3 gap-4 min-h-[420px]">
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-2"><MessageSquare size={16} /> Conversations</h3>
          <button type="button" className="btn-ghost text-xs" onClick={startSupportChat}>+ Support</button>
        </div>
        {conversations.map((c) => (
          <button
            key={c.conversation_id}
            type="button"
            className="w-full text-left p-3 rounded-xl transition-colors"
            style={{
              background: activeId === c.conversation_id ? "var(--surface-2)" : "transparent",
              border: activeId === c.conversation_id ? "1px solid var(--primary)" : "1px solid transparent",
            }}
            onClick={() => setActiveId(c.conversation_id)}
          >
            <div className="font-medium text-sm">{c.participant_name || c.participant_type}</div>
            {c.order_id && (
              <div className="text-xs" style={{ color: "var(--muted)" }}>Order #{String(c.order_id).slice(-6)}</div>
            )}
          </button>
        ))}
        {!conversations.length && (
          <p className="text-sm py-4" style={{ color: "var(--muted)" }}>No conversations yet.</p>
        )}
      </div>

      <div className="md:col-span-2 card p-4 flex flex-col">
        {activeId ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[240px]">
              {messages.map((m) => (
                <div
                  key={m.message_id}
                  className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                    m.sender_role === "restaurant" ? "ml-auto" : "mr-auto"
                  }`}
                  style={{
                    background: m.sender_role === "restaurant" ? "var(--primary)" : "var(--surface-2)",
                    color: m.sender_role === "restaurant" ? "#0A0A0A" : "var(--text)",
                  }}
                >
                  {m.body}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {CANNED.map((text) => (
                <button key={text} type="button" className="badge cursor-pointer hover:opacity-80" onClick={() => send(text, true)}>
                  {text.slice(0, 28)}…
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(draft)}
              />
              <button type="button" className="btn-primary !px-4" onClick={() => send(draft)}>
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ color: "var(--muted)" }}>
            Select or start a conversation
          </div>
        )}
      </div>
    </div>
  );
}
