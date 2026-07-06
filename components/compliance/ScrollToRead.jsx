"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export default function ScrollToRead({ children, onRead, minHeight = 140 }) {
  const ref = useRef(null);
  const [read, setRead] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
      if (atBottom && !read) {
        setRead(true);
        onRead?.(true);
      }
    };

    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => el.removeEventListener("scroll", check);
  }, [onRead, read]);

  return (
    <div>
      <div
        ref={ref}
        className="rounded-lg p-4 text-sm overflow-y-auto border"
        style={{ maxHeight: minHeight, borderColor: "var(--border)", background: "var(--surface-2)" }}
        data-testid="scroll-to-read"
      >
        {children}
      </div>
      <p className="text-xs mt-2 flex items-center gap-1" style={{ color: read ? "var(--primary)" : "var(--muted)" }}>
        {read ? <><Check size={12} /> Document read to the end</> : "Scroll to the end to continue"}
      </p>
    </div>
  );
}
