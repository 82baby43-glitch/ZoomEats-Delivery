import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Reconciliation disabled during Stripe rollback — webhook is the payment source of truth. */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.RECONCILE_CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, skipped: true, reason: "reconciliation_disabled" });
}
