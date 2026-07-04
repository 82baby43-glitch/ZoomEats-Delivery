import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { handleStripeWebhook, type StripeEvent } from "@/lib/server/stripeWebhook";
import { getStripeWebhookSecret } from "@/lib/server/stripeEnv";

export const runtime = "nodejs";

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<StripeEvent> {
  if (!sigHeader || !secret) throw new Error("Missing signature or secret");

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of sigHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid stripe-signature header");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = `${timestamp}.${payload}`;
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!signatures.some((sig) => sig === expected)) {
    throw new Error("Webhook signature mismatch");
  }

  const parsed = JSON.parse(payload) as StripeEvent;
  if (!parsed?.id || !parsed?.type || !parsed?.data?.object) {
    throw new Error("Invalid event payload");
  }
  return parsed;
}

export async function POST(req: NextRequest) {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    console.error(JSON.stringify({ error: "webhook_not_configured" }));
    return new NextResponse("OK", { status: 200 });
  }

  let payload = "";
  try {
    payload = await req.text();
  } catch (e) {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : "read_body_failed" }));
    return new NextResponse("OK", { status: 200 });
  }

  const sigHeader = req.headers.get("stripe-signature") ?? "";

  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(payload, sigHeader, webhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalid_signature";
    console.error(JSON.stringify({ error: message }));
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    await handleStripeWebhook(db, event);
  } catch (e) {
    console.error(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        event_id: event?.id ?? null,
        event_type: event?.type ?? null,
      })
    );
  }

  return new NextResponse("OK", { status: 200 });
}
