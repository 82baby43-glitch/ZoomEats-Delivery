import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { getPwaConfig, resolveAppType } from "@/lib/pwa/appContext";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://zoomeats.net";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("host") || "";
  const appHeader = headerStore.get("x-zoomeats-app");
  const appType = appHeader || resolveAppType(host, headerStore.get("x-zoomeats-path") || "/");
  const cfg = getPwaConfig(appType);

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: `${cfg.name} — Columbia MO`,
      template: `%s | ${cfg.name}`,
    },
    description: cfg.description,
    keywords: ["food delivery Columbia Missouri", "local restaurants delivery", "ZoomEats", "Columbia MO food"],
    applicationName: cfg.name,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: cfg.name,
    },
    formatDetection: { telephone: false },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: siteUrl,
      siteName: cfg.name,
      title: cfg.name,
      description: cfg.description,
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: cfg.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: cfg.name,
      description: cfg.description,
      images: ["/icons/icon-512.png"],
    },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#B6F127",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="pb-16 md:pb-0">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
