"use client";

import DreamlandRecCard from "@/components/dreamland/DreamlandRecCard";

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const recs = Array.isArray(message.recommendations) ? message.recommendations : [];

  return (
    <div className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
      <div className={`flex ${isUser ? "justify-end" : "justify-start"} w-full`}>
        <div
          className="max-w-[90%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
          style={
            isUser
              ? { background: "var(--primary)", color: "#0A0A0A" }
              : {
                  background: "linear-gradient(135deg, var(--surface-2) 0%, rgba(167,139,250,0.08) 100%)",
                  color: "var(--text)",
                }
          }
        >
          {message.text}
        </div>
      </div>
      {!isUser && recs.length > 0 && (
        <div className="w-full space-y-2 max-w-[95%]">
          {recs.slice(0, 2).map((rec) => (
            <DreamlandRecCard key={`${rec.restaurant_id}-${rec.menu_item_id}`} rec={rec} compact />
          ))}
        </div>
      )}
    </div>
  );
}
