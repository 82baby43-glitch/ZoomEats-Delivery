"use client";

import { initialsFromName } from "@/lib/profiles/display";

export default function UserAvatar({ name, src, size = 64, className = "" }) {
  const px = typeof size === "number" ? `${size}px` : size;
  const initials = initialsFromName(name);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{ width: px, height: px, background: "var(--surface-2)", color: "var(--primary)" }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
