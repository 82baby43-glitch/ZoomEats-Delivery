/** Client-side food photo enhancement pipeline for menu-ready images. */

export type EnhanceResult = {
  blob: Blob;
  previewUrl: string;
  metadata: {
    original_width: number;
    original_height: number;
    output_width: number;
    output_height: number;
    steps: string[];
  };
};

const MENU_ASPECT = 4 / 3;
const TARGET_WIDTH = 1200;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

function sampleCornerColor(data: ImageData, width: number, height: number) {
  const samples: number[][] = [];
  const points = [
    [2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3],
    [Math.floor(width / 2), 2], [Math.floor(width / 2), height - 3],
  ];
  for (const [x, y] of points) {
    const i = (y * width + x) * 4;
    samples.push([data.data[i], data.data[i + 1], data.data[i + 2]]);
  }
  const avg = [0, 0, 0];
  for (const s of samples) {
    avg[0] += s[0];
    avg[1] += s[1];
    avg[2] += s[2];
  }
  return avg.map((v) => v / samples.length);
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function removeBackground(data: ImageData, width: number, height: number) {
  const bg = sampleCornerColor(data, width, height);
  const [br, bgc, bb] = bg;
  const threshold = 42;
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const dist = colorDistance(r, g, b, br, bgc, bb);
    if (dist < threshold) {
      const blend = Math.max(0, 1 - dist / threshold);
      data.data[i] = Math.round(r * (1 - blend) + 255 * blend);
      data.data[i + 1] = Math.round(g * (1 - blend) + 252 * blend);
      data.data[i + 2] = Math.round(b * (1 - blend) + 248 * blend);
    }
  }
}

function autoWhiteBalance(data: ImageData) {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  for (let i = 0; i < data.data.length; i += 4) {
    const lum = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
    if (lum > 180) {
      rSum += data.data[i];
      gSum += data.data[i + 1];
      bSum += data.data[i + 2];
      count += 1;
    }
  }
  if (!count) return;
  const avgR = rSum / count;
  const avgG = gSum / count;
  const avgB = bSum / count;
  const gray = (avgR + avgG + avgB) / 3;
  const rGain = gray / Math.max(avgR, 1);
  const gGain = gray / Math.max(avgG, 1);
  const bGain = gray / Math.max(avgB, 1);
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] = Math.min(255, data.data[i] * rGain);
    data.data[i + 1] = Math.min(255, data.data[i + 1] * gGain);
    data.data[i + 2] = Math.min(255, data.data[i + 2] * bGain);
  }
}

function adjustLighting(data: ImageData, brightness = 1.06, contrast = 1.1) {
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = data.data[i + c] / 255;
      v = (v - 0.5) * contrast + 0.5;
      v *= brightness;
      data.data[i + c] = Math.min(255, Math.max(0, Math.round(v * 255)));
    }
  }
}

function sharpenImageData(data: ImageData, amount = 0.4) {
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
        const out = (y * width + x) * 4 + c;
        px[out] = Math.min(255, Math.max(0, Math.round(px[out] * (1 - amount) + sum * amount)));
      }
    }
  }
}

function boostSaturation(data: ImageData, amount = 1.12) {
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    data.data[i] = Math.min(255, gray + (r - gray) * amount);
    data.data[i + 1] = Math.min(255, gray + (g - gray) * amount);
    data.data[i + 2] = Math.min(255, gray + (b - gray) * amount);
  }
}

function professionalCrop(width: number, height: number) {
  const currentAspect = width / height;
  let cropW = width;
  let cropH = height;
  if (currentAspect > MENU_ASPECT) {
    cropW = Math.round(height * MENU_ASPECT);
  } else {
    cropH = Math.round(width / MENU_ASPECT);
  }
  const sx = Math.floor((width - cropW) / 2);
  const sy = Math.floor((height - cropH) / 2);
  return { sx, sy, cropW, cropH };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))), "image/jpeg", quality);
  });
}

export async function enhanceFoodPhoto(file: File): Promise<EnhanceResult> {
  const steps: string[] = [];
  const img = await loadImage(file);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;
  steps.push("loaded");

  const work = document.createElement("canvas");
  work.width = origW;
  work.height = origH;
  const wctx = work.getContext("2d");
  if (!wctx) throw new Error("Canvas unavailable");
  wctx.drawImage(img, 0, 0);
  steps.push("background_removed");
  steps.push("lighting_improved");

  let imageData = wctx.getImageData(0, 0, origW, origH);
  removeBackground(imageData, origW, origH);
  adjustLighting(imageData, 1.08, 1.12);
  autoWhiteBalance(imageData);
  steps.push("color_corrected");
  wctx.putImageData(imageData, 0, 0);

  const { sx, sy, cropW, cropH } = professionalCrop(origW, origH);
  const cropped = document.createElement("canvas");
  cropped.width = cropW;
  cropped.height = cropH;
  const cctx = cropped.getContext("2d");
  if (!cctx) throw new Error("Canvas unavailable");
  cctx.drawImage(work, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
  steps.push("professional_crop");

  const outW = Math.max(TARGET_WIDTH, cropW);
  const outH = Math.round(outW / MENU_ASPECT);
  const output = document.createElement("canvas");
  output.width = outW;
  output.height = outH;
  const octx = output.getContext("2d");
  if (!octx) throw new Error("Canvas unavailable");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, outW, outH);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  const scale = Math.min(outW / cropW, outH / cropH);
  const drawW = Math.round(cropW * scale);
  const drawH = Math.round(cropH * scale);
  octx.drawImage(cropped, Math.floor((outW - drawW) / 2), Math.floor((outH - drawH) / 2), drawW, drawH);
  if (outW > cropW) steps.push("resolution_enhanced");

  imageData = octx.getImageData(0, 0, outW, outH);
  boostSaturation(imageData, 1.1);
  sharpenImageData(imageData, 0.35);
  steps.push("sharpened");
  steps.push("menu_ready");
  octx.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(output, 0.93);
  const previewUrl = URL.createObjectURL(blob);

  return {
    blob,
    previewUrl,
    metadata: {
      original_width: origW,
      original_height: origH,
      output_width: outW,
      output_height: outH,
      steps,
    },
  };
}

export function revokeEnhancePreview(url: string) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
