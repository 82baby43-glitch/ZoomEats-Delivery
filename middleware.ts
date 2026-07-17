import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/",
  "/login",
  "/auth/callback",
  "/cart",
  "/checkout",
  "/offline",
  "/manifest.webmanifest",
  "/r/",
  "/api/",
];

const ROLE_ROUTE_PREFIXES: Record<string, string[]> = {
  "/driver": ["driver", "delivery", "founder_driver"],
  "/delivery": ["driver", "delivery", "founder_driver"],
  "/restaurant": ["restaurant_owner", "restaurant_staff", "vendor"],
  "/vendor": ["restaurant_owner", "restaurant_staff", "vendor"],
  "/admin": ["admin", "super_admin", "founder_driver"],
  "/dispatcher": ["dispatcher", "admin", "super_admin"],
};

function isPublic(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p));
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    // Legacy path aliases (single-domain routing)
    if (pathname === "/driver") {
      return redirectTo(request, "/driver/dashboard");
    }
    if (pathname === "/restaurant") {
      return redirectTo(request, "/restaurant/dashboard");
    }

    const response = NextResponse.next();
    response.headers.set("x-zoomeats-path", pathname);
    response.headers.set("x-zoomeats-app", "zoomeats");

    if (isPublic(pathname)) return response;

    for (const [prefix, roles] of Object.entries(ROLE_ROUTE_PREFIXES)) {
      if (pathname.startsWith(prefix)) {
        response.headers.set("x-required-roles", roles.join(","));
        break;
      }
    }

    return response;
  } catch (error) {
    console.error("[middleware] failed:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|splash.svg|logo.svg|sw.js|workbox).*)"],
};
