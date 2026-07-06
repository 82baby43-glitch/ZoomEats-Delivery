import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAgreementPdf, dataUrlToBytes } from "./generateAgreementPdf.ts";

export async function storeSignatureImage(
  db: SupabaseClient,
  userId: string,
  acceptanceId: string,
  dataUrl: string | null | undefined
): Promise<string | null> {
  if (!dataUrl?.startsWith("data:image")) return null;
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes) return null;
  const path = `${userId}/signatures/${acceptanceId}.png`;
  const { error } = await db.storage.from("signed-agreements").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function archiveSignedPdf(
  db: SupabaseClient,
  opts: {
    userId: string;
    acceptanceId: string;
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
    signatureImagePath?: string | null;
    signatureDataUrl?: string | null;
  }
): Promise<string | null> {
  let imageBytes: Uint8Array | null = null;
  if (opts.signatureDataUrl) {
    imageBytes = dataUrlToBytes(opts.signatureDataUrl);
  } else if (opts.signatureImagePath) {
    const { data } = await db.storage.from("signed-agreements").download(opts.signatureImagePath);
    if (data) imageBytes = new Uint8Array(await data.arrayBuffer());
  }

  const pdfBytes = await generateAgreementPdf({
    title: opts.title,
    body: opts.body,
    version: opts.version,
    signerName: opts.signerName,
    initials: opts.initials,
    signatureMethod: opts.signatureMethod,
    acceptedAt: opts.acceptedAt,
    ipAddress: opts.ipAddress,
    device: opts.device,
    browser: opts.browser,
    signatureImageBytes: imageBytes,
  });

  const pdfPath = `${opts.userId}/pdfs/${opts.acceptanceId}.pdf`;
  const { error } = await db.storage.from("signed-agreements").upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return pdfPath;
}

export async function signedPdfUrl(db: SupabaseClient, path: string, expiresSec = 3600) {
  const { data } = await db.storage.from("signed-agreements").createSignedUrl(path, expiresSec);
  return data?.signedUrl || null;
}
