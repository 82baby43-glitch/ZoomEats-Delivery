import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { reconcilePayments } from "@/lib/server/reconcilePayments";
import { getStripeApiKey } from "@/lib/server/stripeEnv";

export const runtime = "nodejs";

/** POST /api/admin/reconcile — cron-safe Stripe ↔ Supabase reconciliation */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.RECONCILE_CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeKey = getStripeApiKey();
  if (!stripeKey) {
    return NextResponse.json({ skipped: true, reason: "no_stripe_key" });
  }

  const db = getSupabaseAdmin();
  const result = await reconcilePayments(db, stripeKey);
  return NextResponse.json({ ok: true, ...result });
}
