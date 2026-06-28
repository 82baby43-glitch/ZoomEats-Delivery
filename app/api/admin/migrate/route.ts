import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

export const runtime = "nodejs";

/**
 * One-shot RLS migration endpoint (server-only).
 * Requires DATABASE_URL (postgres password) or SUPABASE_ACCESS_TOKEN in env.
 * Protected by MIGRATION_SECRET header when set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MIGRATION_SECRET;
  if (secret && req.headers.get("x-migration-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const migrationFile = resolve("supabase/migrations/20260628_supabase_auth_rls.sql");

  if (databaseUrl) {
    const result = spawnSync(
      "npx",
      ["supabase@latest", "db", "query", "--file", migrationFile, "--db-url", databaseUrl],
      { encoding: "utf8" }
    );
    if (result.status !== 0) {
      return NextResponse.json({ error: result.stderr || result.stdout }, { status: 500 });
    }
    return NextResponse.json({ ok: true, method: "DATABASE_URL" });
  }

  if (accessToken) {
    const sql = readFileSync(migrationFile, "utf8");
    const res = await fetch("https://api.supabase.com/v1/projects/njrrhckegbfqhwkqkzvw/database/query", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const body = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: body }, { status: res.status });
    }
    return NextResponse.json({ ok: true, method: "management_api", body });
  }

  return NextResponse.json(
    {
      error:
        "Cannot run DDL with service role key. Set DATABASE_URL (postgres password) or SUPABASE_ACCESS_TOKEN (sbp_...) in Vercel env.",
    },
    { status: 400 }
  );
}
