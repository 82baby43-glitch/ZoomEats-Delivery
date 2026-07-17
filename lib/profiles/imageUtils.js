export const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export function validateImageFile(file) {
  if (!file) return "No file selected";
  if (!ALLOWED_IMAGE_TYPES.includes(String(file.type).toLowerCase())) {
    return "Use JPG, PNG, or WEBP images";
  }
  if (file.size > PROFILE_IMAGE_MAX_BYTES) return "Image must be 10 MB or smaller";
  return null;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not process image"));
      else resolve(blob);
    }, type, quality);
  });
}

export async function processProfileImage(file) {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const img = await loadImageFromFile(file);
  const size = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - size) / 2);
  const sy = Math.floor((img.height - size) / 2);

  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = 800;
  fullCanvas.height = 800;
  const fullCtx = fullCanvas.getContext("2d");
  fullCtx.drawImage(img, sx, sy, size, size, 0, 0, 800, 800);
  const fullBlob = await canvasToBlob(fullCanvas, "image/jpeg", 0.88);

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 160;
  thumbCanvas.height = 160;
  const thumbCtx = thumbCanvas.getContext("2d");
  thumbCtx.drawImage(img, sx, sy, size, size, 0, 0, 160, 160);
  const thumbBlob = await canvasToBlob(thumbCanvas, "image/jpeg", 0.82);

  return {
    fullBlob,
    thumbBlob,
    contentType: "image/jpeg",
    fileName: (file.name || "profile.jpg").replace(/\.[^.]+$/, ".jpg"),
  };
}

export async function processVehicleImage(file) {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const img = await loadImageFromFile(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullCtx = fullCanvas.getContext("2d");
  fullCtx.drawImage(img, 0, 0, width, height);
  const fullBlob = await canvasToBlob(fullCanvas, "image/jpeg", 0.86);

  const thumbCanvas = document.createElement("canvas");
  const thumbScale = Math.min(1, 320 / Math.max(width, height));
  thumbCanvas.width = Math.round(width * thumbScale);
  thumbCanvas.height = Math.round(height * thumbScale);
  const thumbCtx = thumbCanvas.getContext("2d");
  thumbCtx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumbBlob = await canvasToBlob(thumbCanvas, "image/jpeg", 0.8);

  return {
    fullBlob,
    thumbBlob,
    contentType: "image/jpeg",
    fileName: (file.name || "vehicle.jpg").replace(/\.[^.]+$/, ".jpg"),
  };
}

export async function uploadProcessedImage({ presign, fullBlob, thumbBlob, fileName, contentType }) {
  const fullRes = await fetch(presign.full.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: fullBlob,
  });
  if (!fullRes.ok) throw new Error("Profile upload failed");

  const thumbRes = await fetch(presign.thumb.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: thumbBlob,
  });
  if (!thumbRes.ok) throw new Error("Thumbnail upload failed");

  return {
    full_path: presign.full.storage_path,
    thumbnail_path: presign.thumb.storage_path,
    file_name: fileName,
  };
}
