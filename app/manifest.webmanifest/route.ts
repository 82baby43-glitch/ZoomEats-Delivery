import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildWebManifest } from "@/lib/pwa/manifest";
import { detectAppTypeFromHost } from "@/lib/pwa/appContext";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "zoomeats.com";
  const appHeader = request.headers.get("x-zoomeats-app");
  const appType = appHeader || detectAppTypeFromHost(host);
  const origin = request.nextUrl.origin;
  const manifest = buildWebManifest(appType, origin);

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
