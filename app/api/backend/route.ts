import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { handleApiRequest } from "@/lib/server/apiHandler";

export const runtime = "nodejs";
export const maxDuration = 300;

async function proxyToSupabaseEdge(req: NextRequest, payload: unknown) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      {
        error:
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set Supabase env vars on your host, or add SUPABASE_SERVICE_ROLE_KEY for direct DB access.",
        status: 500,
      },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const res = await fetch(`${url}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: authHeader || `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  const status = (data as { status?: number })?.status ?? res.status;
  return NextResponse.json(data, { status: res.ok ? res.status : status });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const path = payload.path as string;
    const method = (payload.method as string) || "GET";
    const body = payload.body ?? {};
    const params = payload.params ?? {};

    const authHeader = req.headers.get("authorization") || "";
    const userToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    const hasServiceRole = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!hasServiceRole || path.startsWith("/admin/uber-direct")) {
      return proxyToSupabaseEdge(req, payload);
    }

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
