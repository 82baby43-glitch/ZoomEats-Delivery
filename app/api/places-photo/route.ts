import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getApiKey(): string {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  );
}

/** Proxy Google Places photos — keeps API key server-side. */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const key = getApiKey();
  if (!name || !key) {
    return NextResponse.json({ error: "missing_name_or_key" }, { status: 400 });
  }

  const path = name.startsWith("places/") ? name : `places/${name}`;
  const target = `https://places.googleapis.com/v1/${path}/media?maxHeightPx=800&maxWidthPx=800&key=${key}`;

  const res = await fetch(target, { redirect: "follow" });
  if (!res.ok) {
    return NextResponse.json({ error: "photo_fetch_failed" }, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
