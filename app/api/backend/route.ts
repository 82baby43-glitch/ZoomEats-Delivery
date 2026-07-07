import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { handleApiRequest } from "@/lib/server/apiHandler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const path = payload.path as string;
    const method = (payload.method as string) || "GET";
    const body = payload.body ?? {};
    const params = payload.params ?? {};

    const authHeader = req.headers.get("authorization") || "";
    const userToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    const db = getSupabaseAdmin();
    const data = await handleApiRequest(db, {
      path,
      method,
      body,
      params,
      userToken: userToken || undefined,
    });

    if (data && typeof data === "object" && "_background" in data) {
      const { _background, ...rest } = data as { _background?: Promise<void> } & Record<string, unknown>;
      if (_background) {
        after(() => _background);
      }
      return NextResponse.json(rest);
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    const status = err.status ?? 500;
    return NextResponse.json({ error: err.message ?? "Internal error", status }, { status });
  }
}
