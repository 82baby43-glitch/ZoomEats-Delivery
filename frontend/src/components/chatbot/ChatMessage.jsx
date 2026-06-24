export default function ChatMessage({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-2 rounded-2xl text-sm"
        style={
          isUser
            ? { background: "var(--primary)", color: "#0A0A0A" }
            : { background: "var(--surface-2)", color: "var(--text)" }
        }
      >
        {message.text}
      </div>
    </div>
  );
}
