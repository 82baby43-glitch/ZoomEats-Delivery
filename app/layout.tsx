import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.zoomeats.net";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ZoomEats — Food Delivery Columbia MO",
    template: "%s | ZoomEats",
  },
  description: "Food delivery in Columbia, Missouri. Order from local restaurants with fast delivery via ZoomEats.",
  keywords: ["food delivery Columbia Missouri", "local restaurants delivery", "ZoomEats", "Columbia MO food"],
  applicationName: "ZoomEats",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZoomEats",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "ZoomEats",
    title: "ZoomEats — Local Food Delivery",
    description: "Curated food delivery — eat well, delivered fast in Columbia, Missouri.",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "ZoomEats" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZoomEats",
    description: "Local food delivery in Columbia, Missouri.",
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
