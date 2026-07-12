/** @type {import('next').NextConfig} */
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/restaurants.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "zoomeats-restaurants",
          expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
          networkTimeoutSeconds: 8,
        },
      },
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/menu.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "zoomeats-menus",
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 12 },
          networkTimeoutSeconds: 8,
        },
      },
      {
        urlPattern: /\/api\/backend/,
        handler: "NetworkOnly",
      },
    ],
  },
});

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = withPWA(nextConfig);
