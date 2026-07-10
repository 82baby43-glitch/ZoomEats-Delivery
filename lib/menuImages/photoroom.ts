import { MENU_ENHANCE_PRESET } from "./config";

const SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";

export type EnhanceResult = {
  bytes: Uint8Array;
  contentType: string;
  preset: string;
};

/**
 * Photoroom Remove Background API — white studio background ("Clean & bright").
 * Uses Basic plan segment endpoint; safe for food (does not alter product pixels).
 */
export async function enhanceMenuImageCleanBright(
  imageBytes: Uint8Array,
  fileName: string,
  apiKey: string
): Promise<EnhanceResult> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(imageBytes)], { type: guessMime(fileName) });
  form.append("image_file", blob, fileName);
  form.append("bg_color", "FFFFFF");
  form.append("format", "jpg");
  form.append("crop", "true");

  const res = await fetch(SEGMENT_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Photoroom enhancement failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(arrayBuffer),
    contentType: "image/jpeg",
    preset: MENU_ENHANCE_PRESET,
  };
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
