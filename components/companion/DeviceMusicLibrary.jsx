"use client";

import { useRef, useState } from "react";
import { FolderOpen, Music, Trash2, Upload } from "lucide-react";

export default function DeviceMusicLibrary({ library, disabled = false }) {
  const fileInputRef = useRef(null);
  const { tracks, ready, addFiles, removeTrack, clearLibrary } = library;
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const onPickFiles = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setBusy(true);
    setStatus(null);
    try {
      const count = await addFiles(files);
      if (count === 0) {
        setStatus({ type: "error", message: "No audio files found. Try MP3, M4A, WAV, or OGG." });
      } else {
        setStatus({
          type: "success",
          message: `Added ${count} track${count === 1 ? "" : "s"}. Press play on the floating player.`,
        });
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Could not add music",
      });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="card p-5 space-y-4" data-testid="device-music-library">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Music size={14} /> Your device music
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Pick songs from your phone or computer. Files stay on your device — never uploaded to ZoomEats.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.webm"
            multiple
            className="hidden"
            disabled={disabled || busy}
            onChange={onPickFiles}
          />
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={disabled || busy || !ready}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} className="inline mr-1" />
            {busy ? "Adding…" : "Add music"}
          </button>
          {tracks.length > 0 && (
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={disabled || busy}
              onClick={() => {
                if (window.confirm("Remove all device tracks from this browser?")) clearLibrary();
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {status && (
        <p
          className="text-xs rounded-lg px-3 py-2"
          style={{
            background: status.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: status.type === "success" ? "#86efac" : "#fca5a5",
          }}
        >
          {status.message}
        </p>
      )}

      {!ready && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>Loading your music library…</p>
      )}

      {ready && tracks.length === 0 && (
        <div
          className="rounded-lg border border-dashed px-4 py-8 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <FolderOpen size={28} className="mx-auto mb-2" style={{ color: "var(--muted)" }} />
          <p className="text-sm font-medium">No tracks yet</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Tap <strong>Add music</strong> to choose audio files from your device.
          </p>
        </div>
      )}

      {tracks.length > 0 && (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {tracks.map((track, i) => (
            <li
              key={track.id}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="truncate flex-1">
                <span className="text-xs mr-2" style={{ color: "var(--muted)" }}>{i + 1}.</span>
                {track.name}
              </span>
              <button
                type="button"
                className="btn-ghost !p-1 shrink-0"
                aria-label={`Remove ${track.name}`}
                onClick={() => removeTrack(track.id)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
