import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Minimal passthrough middleware — restores Vercel edge stability while keeping
// the middleware entrypoint. App context/subdomain routing handled in app code.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|splash.svg|logo.svg|sw.js|workbox).*)"],
};
