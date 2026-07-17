import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildWebManifest } from "@/lib/pwa/manifest";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const manifest = buildWebManifest("customer", origin);

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
