import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export type AgreementPdfInput = {
  title: string;
  body: string;
  version: string;
  signerName: string;
  initials?: string | null;
  signatureMethod: string;
  acceptedAt: string;
  ipAddress?: string | null;
  device?: string | null;
  browser?: string | null;
  signatureImageBytes?: Uint8Array | null;
};

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateAgreementPdf(input: AgreementPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  let y = height - 50;

  const draw = (text: string, size = 11, useBold = false) => {
    page.drawText(text, { x: 50, y, size, font: useBold ? bold : font, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 6;
  };

  draw("ZoomEats — Signed Agreement Record", 16, true);
  draw(`${input.title} · Version ${input.version}`, 12, true);
  y -= 8;

  for (const line of wrapText(input.body, 90)) {
    if (y < 120) break;
    draw(line, 10);
  }

  y -= 12;
  draw("— Electronic Signature Certificate —", 11, true);
  draw(`Signer: ${input.signerName}`);
  if (input.initials) draw(`Initials: ${input.initials}`);
  draw(`Method: ${input.signatureMethod}`);
  draw(`Signed: ${new Date(input.acceptedAt).toISOString()}`);
  if (input.ipAddress) draw(`IP Address: ${input.ipAddress}`);
  if (input.device) draw(`Device: ${input.device}`);
  if (input.browser) draw(`Browser: ${input.browser}`);

  if (input.signatureImageBytes?.length) {
    try {
      const isPng = input.signatureImageBytes[0] === 0x89;
      const img = isPng
        ? await doc.embedPng(input.signatureImageBytes)
        : await doc.embedJpg(input.signatureImageBytes);
      const dims = img.scale(0.35);
      page.drawImage(img, { x: 50, y: Math.max(40, y - dims.height - 10), width: dims.width, height: dims.height });
    } catch {
      /* skip bad image */
    }
  }

  page.drawText("This document was generated electronically by ZoomEats Compliance.", {
    x: 50,
    y: 30,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return doc.save();
}

export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) return null;
  const raw = atob(m[2]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
