/** Client-side food photo enhancement (brightness, contrast, saturation, sharpness). */

export async function enhanceFoodPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.filter = "brightness(1.08) contrast(1.12) saturate(1.15)";
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  sharpenImageData(imageData, 0.35);
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Enhancement failed"))), "image/jpeg", 0.92);
  });
}

function sharpenImageData(data: ImageData, amount: number) {
  const { width, height, data: px } = data;
  const copy = new Uint8ClampedArray(px);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += copy[idx] * kernel[ki++];
          }
        }
        const out = ((y * width + x) * 4) + c;
        px[out] = Math.min(255, Math.max(0, Math.round(px[out] * (1 - amount) + sum * amount)));
      }
    }
  }
}
