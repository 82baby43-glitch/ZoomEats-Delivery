"use client";

import { MessageCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function DreamlandAvatar({ size = 40, pulse = false }) {
  return (
    <motion.div
      className="rounded-xl flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: "var(--primary)",
        color: "#0A0A0A",
        boxShadow: pulse ? "0 0 0 4px rgba(182, 241, 39, 0.18)" : "none",
      }}
      animate={pulse ? { scale: [1, 1.04, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <MessageCircle size={Math.round(size * 0.5)} strokeWidth={2.5} />
    </motion.div>
  );
}
