import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { handleStripeWebhook } from "@/lib/server/stripeWebhook";

export const runtime = "nodejs";

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<Record<string, unknown>> {
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) throw new Error("Invalid stripe-signature header");

  const signed = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected !== parts.v1) throw new Error("Webhook signature mismatch");
  return JSON.parse(payload);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const payload = await req.text();
  const sigHeader = req.headers.get("stripe-signature") || "";

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = (await verifyStripeSignature(payload, sigHeader, webhookSecret)) as typeof event;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  await handleStripeWebhook(db, event, { asyncProcess: true });

  return new NextResponse("OK", { status: 200 });
}
