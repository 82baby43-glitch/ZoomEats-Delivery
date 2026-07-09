"use client";

import { useEffect, useRef, useState } from "react";

export default function ElectronicSignature({ value, onChange, label = "Draw your signature" }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState("draw");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0A0A0A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#B6F127";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e) => {
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.preventDefault();
  };

  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    e.preventDefault();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onChange?.({ ...value, signature_image: dataUrl });
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0A0A0A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange?.({ ...value, signature_image: "" });
  };

  return (
    <div className="space-y-2" data-testid="electronic-signature">
      <div className="flex gap-2 text-xs">
        <button type="button" className={mode === "draw" ? "badge ring-2 ring-[var(--primary)]" : "badge"} onClick={() => setMode("draw")}>Draw</button>
        <button type="button" className={mode === "type" ? "badge ring-2 ring-[var(--primary)]" : "badge"} onClick={() => setMode("type")}>Type</button>
        <button type="button" className="badge" onClick={clear}>Clear</button>
      </div>
      {mode === "type" ? (
        <input
          className="input-field w-full font-display text-xl"
          placeholder="Type full legal name"
          value={value?.typed_name || ""}
          onChange={(e) => onChange?.({ ...value, typed_name: e.target.value })}
          data-testid="signature-typed-name"
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={480}
          height={120}
          className="w-full rounded-xl border cursor-crosshair touch-none"
          style={{ borderColor: "var(--border)", background: "#0A0A0A" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      )}
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}
