"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Camera, CheckCircle2, ImageIcon } from "lucide-react";

async function uploadPickupPhoto({ orderId, photoType, file, coords }) {
  const presignRes = await api.post("/driver/pickup-photos/presign", {
    order_id: orderId,
    photo_type: photoType,
    file_name: file.name || "pickup.jpg",
    content_type: file.type || "image/jpeg",
    latitude: coords?.lat,
    longitude: coords?.lng,
  });
  const presign = presignRes?.data ?? presignRes;
  const uploadRes = await fetch(presign.upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Photo upload failed");
  const completeRes = await api.post("/driver/pickup-photos/complete", { photo_id: presign.photo_id });
  return completeRes?.data ?? completeRes;
}

export default function PickupPhotoInstructions({
  orderId,
  compact = false,
  onUpdated,
  instructionsPath,
  allowGuideEdit = false,
  restaurantId,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(!compact);
  const [guideForm, setGuideForm] = useState({
    entrance_instructions: "",
    parking_instructions: "",
    counter_instructions: "",
    shelf_location: "",
    pickup_notes: "",
  });
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      let res;
      if (instructionsPath === "/founder-driver/pickup-instructions") {
        res = await api.get("/founder-driver/pickup-instructions", { params: { order_id: orderId } });
      } else {
        res = await api.get(instructionsPath || `/driver/pickup-instructions/${orderId}`);
      }
      const payload = res?.data ?? res;
      setData(payload);
      setGuideForm({
        entrance_instructions: payload.entrance_instructions || "",
        parking_instructions: payload.parking_instructions || "",
        counter_instructions: payload.counter_instructions || "",
        shelf_location: payload.shelf_location || "",
        pickup_notes: payload.pickup_notes || "",
      });
      onUpdated?.(payload);
    } catch (e) {
      setError(e?.message || "Could not load pickup instructions");
    } finally {
      setLoading(false);
    }
  }, [orderId, instructionsPath, onUpdated]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (photoType, file) => {
    if (!file || !orderId) return;
    setUploading(photoType);
    setError("");
    try {
      const coords = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { maximumAge: 60000, timeout: 5000 }
        );
      });
      const updated = await uploadPickupPhoto({ orderId, photoType, file, coords });
      setData(updated);
      onUpdated?.(updated);
    } catch (e) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const saveGuide = async () => {
    if (!restaurantId && !data?.restaurant_id) return;
    await api.post("/founder-driver/pickup-guides", {
      restaurant_id: restaurantId || data.restaurant_id,
      ...guideForm,
    });
    await load();
  };

  if (!orderId) return null;
  if (loading && !data) {
    return <div className="text-xs py-2" style={{ color: "var(--muted)" }}>Loading pickup photo guide…</div>;
  }

  const completedCount = (data?.checklist || []).filter((c) => c.completed).length;

  return (
    <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: "var(--border)" }} data-testid={`pickup-photo-instructions-${orderId}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <div className="font-bold text-sm flex items-center gap-2">
            <Camera size={14} /> Pickup photo instructions
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {data?.restaurant_name} · {completedCount}/{(data?.checklist || []).length} photos
          </div>
        </div>
        <span className="badge">{expanded ? "Hide" : "Show"}</span>
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {expanded && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <div><strong>Entrance:</strong> {data?.entrance_instructions}</div>
            <div><strong>Parking:</strong> {data?.parking_instructions}</div>
            <div><strong>Counter:</strong> {data?.counter_instructions}</div>
            <div><strong>Shelf:</strong> {data?.shelf_location}</div>
          </div>
          {data?.pickup_notes && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>{data.pickup_notes}</p>
          )}

          <div className="space-y-2">
            {(data?.checklist || []).map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1">
                    {item.completed ? <CheckCircle2 size={14} className="text-green-500" /> : <ImageIcon size={14} />}
                    {item.label}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{item.hint}</p>
                </div>
                <div>
                  <input
                    ref={(el) => { fileRefs.current[item.id] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(item.id, file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary text-xs whitespace-nowrap"
                    disabled={uploading === item.id}
                    onClick={() => fileRefs.current[item.id]?.click()}
                    data-testid={`pickup-photo-upload-${item.id}`}
                  >
                    {uploading === item.id ? "Uploading…" : item.completed ? "Retake" : "Add photo"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {(data?.photos || []).length > 0 && (
            <div>
              <div className="text-xs font-bold mb-2">Community pickup photos</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {data.photos.slice(0, 8).map((p) => (
                  <a
                    key={p.photo_id}
                    href={p.url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg overflow-hidden border aspect-square"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {p.url ? (
                      <img src={p.url} alt={p.photo_type} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--muted)" }}>{p.photo_type}</div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {allowGuideEdit && (
            <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs font-bold">Edit restaurant pickup guide (founder)</div>
              <textarea className="input-field text-xs" rows={2} placeholder="Entrance instructions" value={guideForm.entrance_instructions} onChange={(e) => setGuideForm({ ...guideForm, entrance_instructions: e.target.value })} />
              <textarea className="input-field text-xs" rows={2} placeholder="Parking instructions" value={guideForm.parking_instructions} onChange={(e) => setGuideForm({ ...guideForm, parking_instructions: e.target.value })} />
              <textarea className="input-field text-xs" rows={2} placeholder="Counter instructions" value={guideForm.counter_instructions} onChange={(e) => setGuideForm({ ...guideForm, counter_instructions: e.target.value })} />
              <input className="input-field text-xs" placeholder="Shelf location" value={guideForm.shelf_location} onChange={(e) => setGuideForm({ ...guideForm, shelf_location: e.target.value })} />
              <button type="button" className="btn-primary text-xs" onClick={saveGuide} data-testid="founder-save-pickup-guide">Save pickup guide</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
