"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import UserAvatar from "@/components/profile/UserAvatar";
import { processProfileImage, uploadProcessedImage } from "@/lib/profiles/imageUtils";

export default function ProfilePhotoUploader({ profile, onUpdated }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selfieOpen, setSelfieOpen] = useState(false);

  const stopSelfieStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => () => stopSelfieStream(), []);

  useEffect(() => {
    if (!selfieOpen || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [selfieOpen]);

  const startSelfieCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraRef.current?.click();
      return;
    }
    try {
      stopSelfieStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" } },
        audio: false,
      });
      streamRef.current = stream;
      setSelfieOpen(true);
    } catch {
      cameraRef.current?.click();
    }
  };

  const closeSelfieCamera = () => {
    stopSelfieStream();
    setSelfieOpen(false);
  };

  const uploadFile = async (file) => {
    setBusy(true);
    setError("");
    try {
      const processed = await processProfileImage(file);
      const [fullPresign, thumbPresign] = await Promise.all([
        api.post("/profile/photo/presign", {
          file_name: processed.fileName,
          content_type: processed.contentType,
          variant: "full",
        }),
        api.post("/profile/photo/presign", {
          file_name: processed.fileName,
          content_type: processed.contentType,
          variant: "thumbnail",
        }),
      ]);

      const paths = await uploadProcessedImage({
        presign: { full: fullPresign.data, thumb: thumbPresign.data },
        fullBlob: processed.fullBlob,
        thumbBlob: processed.thumbBlob,
        fileName: processed.fileName,
        contentType: processed.contentType,
      });

      const result = await api.post("/profile/photo/complete", paths);
      onUpdated?.(result?.data);
    } catch (e) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const captureSelfie = async () => {
    try {
      const video = videoRef.current;
      if (!video?.videoWidth || !video?.videoHeight) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      closeSelfieCamera();
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not capture photo"))), "image/jpeg", 0.92);
      });
      await uploadFile(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
    } catch (e) {
      setError(e?.message || "Could not capture photo");
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.delete("/profile/photo");
      onUpdated?.(result?.data ?? { profile_photo_url: null, thumbnail_photo_url: null, picture: null });
    } catch (e) {
      setError(e?.message || "Could not remove photo");
    } finally {
      setBusy(false);
    }
  };

  const photo = profile?.thumbnail_photo_url || profile?.profile_photo_url || profile?.picture;

  return (
    <div className="flex flex-col sm:flex-row items-start gap-4" data-testid="profile-photo-uploader">
      <UserAvatar name={profile?.display_name || profile?.name} src={photo} size={96} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !py-2 text-sm inline-flex items-center gap-2" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> Upload photo
          </button>
          <button type="button" className="btn-ghost !py-2 text-sm inline-flex items-center gap-2" disabled={busy} onClick={startSelfieCamera}>
            <Camera size={14} /> Take photo
          </button>
          {photo && (
            <button type="button" className="btn-ghost !py-2 text-sm inline-flex items-center gap-2 text-red-400" disabled={busy} onClick={removePhoto}>
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>JPG, PNG, or WEBP up to 10 MB. Images are cropped, compressed, and optimized automatically.</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
      </div>

      {selfieOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="card w-full max-w-sm p-4 space-y-4" data-testid="profile-selfie-camera">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold">Take a selfie</h3>
              <button type="button" className="btn-ghost !p-2" onClick={closeSelfieCamera} aria-label="Close camera">
                <X size={18} />
              </button>
            </div>
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black aspect-[3/4] object-cover" style={{ transform: "scaleX(-1)" }} />
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={closeSelfieCamera}>Cancel</button>
              <button type="button" className="btn-primary flex-1" disabled={busy} onClick={captureSelfie}>Capture</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
