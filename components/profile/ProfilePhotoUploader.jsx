"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import UserAvatar from "@/components/profile/UserAvatar";
import { processProfileImage, uploadProcessedImage } from "@/lib/profiles/imageUtils";

export default function ProfilePhotoUploader({ profile, onUpdated }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          <button type="button" className="btn-ghost !py-2 text-sm inline-flex items-center gap-2" disabled={busy} onClick={() => cameraRef.current?.click()}>
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
    </div>
  );
}
