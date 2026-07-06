import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/",
  "/login",
  "/auth/callback",
  "/cart",
  "/checkout",
  "/r/",
  "/api/",
];

const ROLE_ROUTE_PREFIXES: Record<string, string[]> = {
  "/driver": ["delivery"],
  "/delivery": ["delivery"],
  "/restaurant": ["vendor"],
  "/vendor": ["vendor"],
  "/admin": ["admin"],
  "/dispatcher": ["dispatcher", "admin"],
};

function isPublic(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Legacy path aliases
  if (pathname === "/driver") {
    return NextResponse.redirect(new URL("/driver/dashboard", request.url));
  }
  if (pathname === "/restaurant") {
    return NextResponse.redirect(new URL("/restaurant/dashboard", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-zoomeats-path", pathname);

  // Full auth/compliance checks run client-side via ComplianceGate (Supabase session in localStorage)
  if (isPublic(pathname)) return response;

  for (const [prefix, roles] of Object.entries(ROLE_ROUTE_PREFIXES)) {
    if (pathname.startsWith(prefix)) {
      response.headers.set("x-required-roles", roles.join(","));
      break;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
