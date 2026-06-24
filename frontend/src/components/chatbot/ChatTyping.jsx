export default function ChatTyping() {
  return (
    <div className="flex justify-start">
      <div className="px-3 py-2 rounded-2xl text-sm" style={{ background: "var(--surface-2)" }}>
        <span className="inline-flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)" }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "0.1s" }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "0.2s" }} />
        </span>
      </div>
    </div>
  );
}
