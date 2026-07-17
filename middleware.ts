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

function detectAppType(host: string): "customer" | "driver" | "restaurant" {
  const h = host.toLowerCase().split(":")[0];
  if (h.startsWith("driver.")) return "driver";
  if (h.startsWith("restaurant.")) return "restaurant";
  return "customer";
}

function applyAppContext(response: NextResponse, appType: string) {
  response.headers.set("x-zoomeats-app", appType);
  response.cookies.set("zoomeats_app", appType, { path: "/", sameSite: "lax" });
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  const appType = detectAppType(host);

  // Subdomain root → role dashboard/login
  if (pathname === "/" && appType === "driver") {
    return applyAppContext(
      NextResponse.redirect(new URL("/driver/dashboard", request.url)),
      appType
    );
  }
  if (pathname === "/" && appType === "restaurant") {
    return applyAppContext(
      NextResponse.redirect(new URL("/restaurant/dashboard", request.url)),
      appType
    );
  }

  // Legacy path aliases
  if (pathname === "/driver") {
    return applyAppContext(
      NextResponse.redirect(new URL("/driver/dashboard", request.url)),
      appType
    );
  }
  if (pathname === "/restaurant") {
    return applyAppContext(
      NextResponse.redirect(new URL("/restaurant/dashboard", request.url)),
      appType
    );
  }

  // Subdomain login shortcuts
  if (appType === "driver" && pathname === "/login") {
    return applyAppContext(
      NextResponse.redirect(new URL("/driver/login", request.url)),
      appType
    );
  }
  if (appType === "restaurant" && pathname === "/login") {
    return applyAppContext(
      NextResponse.redirect(new URL("/restaurant/login", request.url)),
      appType
    );
  }

  const response = NextResponse.next();
  response.headers.set("x-zoomeats-path", pathname);
  applyAppContext(response, appType);

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|splash.svg|logo.svg|logo.png|sw.js|workbox).*)"],
};
