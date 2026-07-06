"use client";

import { useState } from "react";
import SignaturePad from "@/components/compliance/SignaturePad";
import { PenLine, Upload, Type } from "lucide-react";

const MODES = [
  { id: "draw", label: "Draw", icon: PenLine },
  { id: "typed", label: "Type", icon: Type },
  { id: "upload", label: "Upload", icon: Upload },
];

export default function AgreementSignaturePanel({ value, onChange, disabled = false }) {
  const [mode, setMode] = useState(value?.signature_method || "typed");

  const update = (patch) => {
    onChange?.({ ...value, ...patch, signature_method: patch.signature_method || mode });
  };

  const onUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update({ signature_data: reader.result, signature_method: "upload" });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3" data-testid="signature-panel">
      <div className="flex gap-1">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              className="px-3 py-1.5 text-xs font-bold rounded-lg inline-flex items-center gap-1"
              style={{
                background: mode === m.id ? "var(--primary)" : "var(--surface-2)",
                color: mode === m.id ? "#0A0A0A" : "var(--muted)",
              }}
              onClick={() => { setMode(m.id); update({ signature_method: m.id }); }}
            >
              <Icon size={12} /> {m.label}
            </button>
          );
        })}
      </div>

      {mode === "draw" && (
        <SignaturePad
          onChange={(dataUrl) => update({ signature_data: dataUrl, signature_method: "draw" })}
        />
      )}

      {mode === "typed" && (
        <input
          className="input-field w-full font-serif text-lg"
          placeholder="Type your full legal name"
          disabled={disabled}
          value={value?.typed_name || ""}
          onChange={(e) => update({ typed_name: e.target.value, signature_method: "typed" })}
          data-testid="typed-signature"
        />
      )}

      {mode === "upload" && (
        <div>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="input-field w-full" disabled={disabled} onChange={(e) => onUpload(e.target.files?.[0])} />
          {value?.signature_data && (
            <img src={value.signature_data} alt="Uploaded signature" className="mt-2 h-16 object-contain rounded border p-1 bg-white" />
          )}
        </div>
      )}

      <div>
        <label className="label text-xs">Initials</label>
        <input
          className="input-field w-24 uppercase"
          placeholder="AB"
          maxLength={4}
          disabled={disabled}
          value={value?.initials || ""}
          onChange={(e) => update({ initials: e.target.value.toUpperCase() })}
          data-testid="signature-initials"
        />
      </div>
    </div>
  );
}

export function isSignatureComplete(sig, kind = "signature") {
  if (kind === "checkbox") return true;
  if (!sig?.initials || sig.initials.trim().length < 2) return false;
  const method = sig.signature_method || "typed";
  if (method === "typed") return (sig.typed_name || "").trim().length > 1;
  if (method === "draw" || method === "upload") return Boolean(sig.signature_data);
  return false;
}
