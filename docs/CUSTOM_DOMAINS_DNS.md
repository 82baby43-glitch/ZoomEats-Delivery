# ZoomEats Custom Domains — DNS Setup

Domains are **added to Vercel** and Supabase auth is configured.

**Important:** `zoomeats.com` is currently on a **domain parking** service (`dns-parking.com`) — not connected to ZoomEats yet. You do **not** need Hostinger. Use whichever registrar you actually bought the domain from (GoDaddy, Namecheap, Google, Cloudflare, Vercel Domains, etc.).

## If you do NOT own zoomeats.com yet

1. **Buy the domain** at your preferred registrar, **or** in [Vercel → Domains](https://vercel.com/dashboard/domains) search for `zoomeats.com`
2. After purchase, add the DNS records below

Until you own and point the domain, keep using:

- https://zoom-eats-delivery.vercel.app (customer)
- https://zoom-eats-delivery.vercel.app/driver/dashboard (driver)
- https://zoom-eats-delivery.vercel.app/restaurant/dashboard (restaurant)

The PWA and subdomain routing already work on the Vercel URL.

## If you DO own zoomeats.com (any registrar)

Log in to **your registrar’s DNS panel** (not Hostinger unless that’s where you bought it) and add:

| Type | Name / Host | Value | TTL |
|------|-------------|-------|-----|
| **A** | `@` (apex) | `76.76.21.21` | 3600 |
| **CNAME** | `www` | `cname.vercel-dns.com` | 3600 |
| **CNAME** | `driver` | `cname.vercel-dns.com` | 3600 |
| **CNAME** | `restaurant` | `cname.vercel-dns.com` | 3600 |

### Remove / replace

- Remove any **A** record for `@` pointing to `2.57.91.91` (parking page)
- Remove parking nameservers if switching to Vercel DNS (optional)

### Alternative: Vercel nameservers

In Vercel → Project → Settings → Domains → `zoomeats.com`, you may see nameservers like `ns1.vercel-dns.com`. You can set those at your registrar instead of individual A/CNAME records.

### Optional verification TXT

| Type | Name | Value |
|------|------|-------|
| TXT | `_vercel` | `vc-domain-verify=zoomeats.com,UZoMiWHrSw` |

## Vercel project (already configured)

- Project: `zoom-eats-delivery`
- Domains attached: `zoomeats.com`, `www.zoomeats.com`, `driver.zoomeats.com`, `restaurant.zoomeats.com`

## After DNS propagates (5–60 min)

| URL | App |
|-----|-----|
| https://zoomeats.com | Customer PWA |
| https://driver.zoomeats.com | Driver PWA |
| https://restaurant.zoomeats.com | Restaurant PWA |

`www.zoomeats.com` redirects to `zoomeats.com`.

## Already configured in ZoomEats

- Supabase `site_url`: `https://zoomeats.com/`
- Auth callbacks for all custom domains
- Vercel env: `NEXT_PUBLIC_SITE_URL=https://zoomeats.com`
- Middleware subdomain routing

## Verify

```bash
dig +short zoomeats.com
dig +short driver.zoomeats.com
curl -I https://zoomeats.com/manifest.webmanifest
```

Expected apex IP: `76.76.21.21`

## Re-sync auth (if needed)

```bash
NEXT_PUBLIC_SITE_URL=https://zoomeats.com npm run auth:redirects
```
