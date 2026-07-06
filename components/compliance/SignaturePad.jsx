"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export default function SignaturePad({ onChange, height = 160 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches?.[0] || e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  };

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;
    const isBlank = canvas.toDataURL() === blank.toDataURL();
    setEmpty(isBlank);
    onChange?.(isBlank ? "" : canvas.toDataURL("image/png"));
  }, [onChange]);

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPoint(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    emit();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange?.("");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.offsetWidth, height);
  }, [height]);

  return (
    <div>
      <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height, background: "#fff" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          data-testid="signature-pad"
        />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm" style={{ color: "#999" }}>
            Draw your signature here
          </div>
        )}
      </div>
      <button type="button" className="btn-ghost !py-1 text-xs mt-2 inline-flex items-center gap-1" onClick={clear}>
        <Eraser size={12} /> Clear
      </button>
    </div>
  );
}
