"use client";

import { motion } from "framer-motion";

export default function DreamlandAvatar({ size = 40, pulse = false }) {
  return (
    <motion.div
      className="rounded-full flex items-center justify-center font-display font-black shrink-0"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #c4b5fd 0%, #f9a8d4 50%, #fcd34d 100%)",
        color: "#1a1025",
        fontSize: size * 0.38,
        boxShadow: pulse ? "0 0 24px rgba(196, 181, 253, 0.45)" : "0 4px 14px rgba(0,0,0,0.12)",
      }}
      animate={pulse ? { scale: [1, 1.06, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      ✨
    </motion.div>
  );
}
