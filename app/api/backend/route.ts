import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { handleApiRequest } from "@/lib/server/apiHandler";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const path = payload.path as string;
    const method = (payload.method as string) || "GET";
    const body = payload.body ?? {};
    const params = payload.params ?? {};

    const authHeader = req.headers.get("authorization") || "";
    const userToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    const db = getSupabaseAdmin();
    const data = await handleApiRequest(db, {
      path,
      method,
      body,
      params,
      userToken: userToken || undefined,
      ip,
      userAgent,
    });

    return NextResponse.json(data);
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    const status = err.status ?? 500;
    return NextResponse.json({ error: err.message ?? "Internal error", status }, { status });
  }
}
