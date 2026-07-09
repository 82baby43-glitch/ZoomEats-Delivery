"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, PenLine } from "lucide-react";
import { AGREEMENT_VERSION } from "@/lib/compliance/agreements";

function clientMeta() {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  return {
    user_agent: ua,
    browser: /Chrome|Firefox|Safari|Edge/.exec(ua)?.[0] || "unknown",
    device: /Mobile|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
  };
}

export default function LegalDocumentSigning({
  agreement,
  onSigned,
  defaultName = "",
  busy = false,
}) {
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [typedSignature, setTypedSignature] = useState(defaultName);
  const [useCanvas, setUseCanvas] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const fullText = agreement.fullText || agreement.body;

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (atBottom) setScrolledToEnd(true);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [checkScroll, fullText]);

  useEffect(() => {
    if (!useCanvas || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [useCanvas]);

  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setDrawing(true);
    setHasDrawn(true);
    const ctx = canvasRef.current?.getContext("2d");
    const pos = getCanvasPos(e);
    ctx?.beginPath();
    ctx?.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const pos = getCanvasPos(e);
    ctx?.lineTo(pos.x, pos.y);
    ctx?.stroke();
  };

  const endDraw = () => setDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const signatureValid = useCanvas
    ? hasDrawn
    : typedSignature.trim().length > 1;

  const canSign = scrolledToEnd && agreed && signatureValid && !busy;

  const handleSign = () => {
    if (!canSign) return;
    const signature = useCanvas
      ? canvasRef.current?.toDataURL("image/png") || typedSignature.trim()
      : typedSignature.trim();
    onSigned({
      agreement_type: agreement.type,
      typed_name: typedSignature.trim() || defaultName,
      signature,
      consent_checkbox: true,
      agreement_version: AGREEMENT_VERSION,
      signed_at: new Date().toISOString(),
      scroll_completed: scrolledToEnd,
      ...clientMeta(),
    });
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-bold">{agreement.title}</h3>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Version {AGREEMENT_VERSION} · Scroll to read entire document before signing
          </p>
        </div>
        {agreement.required && (
          <span className="text-xs font-bold text-amber-400 shrink-0">Required</span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="rounded-lg p-4 text-sm leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        data-testid={`agreement-scroll-${agreement.type}`}
      >
        {fullText}
      </div>

      {!scrolledToEnd && (
        <p className="text-xs text-amber-400">Please scroll to the bottom to continue.</p>
      )}
      {scrolledToEnd && (
        <p className="text-xs text-green-400 flex items-center gap-1">
          <Check size={14} /> Document read completely
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={!scrolledToEnd}
        />
        I have read and agree to the {agreement.title}
      </label>

      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            className={`btn-ghost !py-1 text-sm ${!useCanvas ? "ring-1 ring-[var(--primary)]" : ""}`}
            onClick={() => setUseCanvas(false)}
          >
            Typed signature
          </button>
          <button
            type="button"
            className={`btn-ghost !py-1 text-sm inline-flex items-center gap-1 ${useCanvas ? "ring-1 ring-[var(--primary)]" : ""}`}
            onClick={() => setUseCanvas(true)}
          >
            <PenLine size={14} /> Draw signature
          </button>
        </div>

        {!useCanvas ? (
          <input
            className="input-field w-full"
            placeholder="Type your full legal name"
            value={typedSignature}
            onChange={(e) => setTypedSignature(e.target.value)}
            disabled={!scrolledToEnd}
          />
        ) : (
          <div>
            <canvas
              ref={canvasRef}
              width={400}
              height={100}
              className="w-full rounded-lg border cursor-crosshair touch-none"
              style={{ borderColor: "var(--border)", background: "#fff" }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            <button type="button" className="text-xs mt-1 hover:underline" style={{ color: "var(--muted)" }} onClick={clearCanvas}>
              Clear signature
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn-primary w-full"
        disabled={!canSign}
        onClick={handleSign}
        data-testid={`sign-${agreement.type}`}
      >
        {busy ? "Signing…" : "Sign & save document"}
      </button>
    </div>
  );
}

export { clientMeta };
