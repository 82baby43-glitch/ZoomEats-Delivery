import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildWebManifest } from "@/lib/pwa/manifest";
import { detectAppTypeFromHost, resolveAppType } from "@/lib/pwa/appContext";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "zoom-eats-delivery.vercel.app";
  const cookieApp = request.cookies.get("zoomeats_app")?.value;
  const fromHost = detectAppTypeFromHost(host);
  const appType =
    fromHost !== "customer"
      ? fromHost
      : cookieApp || resolveAppType(host, request.nextUrl.pathname);
  const origin = request.nextUrl.origin;
  const manifest = buildWebManifest(appType, origin);

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
      "Vary": "Host, Cookie",
    },
  });
}
