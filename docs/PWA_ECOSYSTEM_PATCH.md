# ZoomEats PWA Ecosystem Patch #1

Progressive Web App upgrade for three installable experiences on a shared Next.js + Supabase stack.

## App experiences

| App | Domain | Start URL |
|-----|--------|-----------|
| Customer | `https://zoomeats.com` | `/` |
| Driver | `https://driver.zoomeats.com` | `/driver/dashboard` |
| Restaurant | `https://restaurant.zoomeats.com` | `/restaurant/dashboard` |

All three share authentication, Supabase database, Stripe, dispatch, and realtime.

## What was added

### Patch 1A — Account access control
- Existing compliance flows preserved: customers auto-approved, drivers/restaurants require admin approval via `ComplianceGate`
- Role-based dashboard access unchanged; PWA install prompt appears after login

### Patch 1B — PWA configuration
- Dynamic manifest: `app/manifest.webmanifest/route.ts`
- Service worker via `@ducanh2912/next-pwa` in `next.config.js`
- Icons: `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- Splash: `components/pwa/AppSplash.jsx`
- Standalone display + theme colors in manifest and `app/layout.tsx`

### Patch 1C — Install prompt
- `components/pwa/InstallPrompt.jsx` + `lib/pwa/useInstallPrompt.js`
- Chrome/Android `beforeinstallprompt`, iOS Safari “Add to Home Screen” hint
- Per-app copy (Customer / Driver / Restaurant)
- Tracks `installation_status` in `pwa_installations`

### Patch 1D — Home screen experience
- `components/navigation/MobileTabBar.jsx` — bottom nav on mobile
- `components/pwa/PwaShell.jsx` — splash + install + tab bar
- Body padding for safe area + tab bar

### Patch 1E — Offline support
- Workbox runtime caching for restaurant/menu API responses
- Offline fallback page: `app/offline/page.tsx`
- Updated `OfflineBanner` messaging

### Patch 1F — Push notifications
- `push_subscriptions` table + API endpoints
- Upgraded `lib/useWebPush.js` for service worker push subscription
- Foreground notifications still work via existing Realtime + Notification API
- Server push send via `lib/server/pwaHandler.ts` (requires VAPID keys)

### Patch 1G — Auth in PWA
- Supabase session in localStorage persists after install (unchanged)
- `ComplianceGate` still enforces role + approval

### Patch 1H — Mobile optimization
- Viewport `viewportFit: cover`, touch-friendly tab bar, responsive layouts preserved

### Patch 1I — SEO
- Open Graph, Twitter cards, keywords in `app/layout.tsx`
- `components/seo/StructuredData.jsx` on landing (Organization, WebSite, Restaurant schema)

### Patch 1J — Domain architecture
- `middleware.ts` detects `driver.*` and `restaurant.*` subdomains
- Sets `x-zoomeats-app` header + cookie for manifest selection
- Root `/` on subdomains redirects to role dashboard

## Database migration

Apply:

```bash
npm run db:migrate
```

Or run `supabase/migrations/20260748_pwa_ecosystem.sql` in the Supabase SQL editor.

Tables:
- `pwa_installations` — install/dismiss tracking
- `push_subscriptions` — Web Push endpoints per user/device

## Environment variables

```env
# Site URL for metadata (production)
NEXT_PUBLIC_SITE_URL=https://zoomeats.com

# Web Push (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@zoomeats.com
```

Set VAPID keys in **Vercel** and **Supabase Edge secrets**:

```bash
supabase secrets set NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:support@zoomeats.com
```

## Deployment

1. **Merge & deploy Next.js** (Vercel auto-deploy on `main`)
2. **Generate icons** (if not committed): `npm run pwa:icons`
3. **Apply migration**: `npm run db:migrate`
4. **Deploy edge functions**: `npm run functions:deploy`
5. **DNS** — point domains to Vercel:
   - `zoomeats.com` → production
   - `driver.zoomeats.com` → same Vercel project
   - `restaurant.zoomeats.com` → same Vercel project
6. **Vercel domains** — add all three hostnames in project settings
7. **Supabase Auth** — add redirect URLs for each domain’s `/auth/callback`
8. **Set VAPID keys** (optional, for background push)

## Testing checklist

- [ ] Customer signup/login → install prompt → Add to Home Screen
- [ ] Driver completes compliance → admin approves → driver subdomain install
- [ ] Restaurant partner flow → admin approves → restaurant subdomain install
- [ ] Login persists after PWA install
- [ ] Offline banner shows when airplane mode
- [ ] Cached restaurant list loads offline (after prior visit)
- [ ] Push permission prompt on driver/vendor dashboards
- [ ] GPS / orders / Stripe checkout still work
- [ ] iPhone Safari: Share → Add to Home Screen
- [ ] Android Chrome: Install banner / prompt

## Key files

| File | Purpose |
|------|---------|
| `lib/pwa/appContext.js` | App type detection |
| `lib/pwa/manifest.js` | Manifest builder |
| `lib/pwa/useInstallPrompt.js` | Install prompt hook |
| `components/pwa/*` | Splash, install UI |
| `components/navigation/MobileTabBar.jsx` | Mobile bottom nav |
| `middleware.ts` | Subdomain routing |
| `next.config.js` | PWA / Workbox |
| `lib/server/pwaHandler.ts` | PWA API |
| `supabase/migrations/20260748_pwa_ecosystem.sql` | DB schema |
