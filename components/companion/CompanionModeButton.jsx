"use client";

import Link from "next/link";
import { Headphones } from "lucide-react";

export default function CompanionModeButton({ href, label = "Companion Mode" }) {
  return (
    <Link
      href={href}
      className="btn-secondary inline-flex items-center gap-2 text-sm"
      data-testid="companion-mode-button"
    >
      <Headphones size={16} /> {label}
    </Link>
  );
}
