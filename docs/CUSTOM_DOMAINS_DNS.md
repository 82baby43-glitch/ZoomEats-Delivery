# ZoomEats Custom Domains — DNS Setup (Hostinger)

Domains are **added to Vercel** and Supabase auth is configured.  
DNS at Hostinger still points to the parking page (`2.57.91.91`) — update these records in **Hostinger → Domains → zoomeats.com → DNS / Nameservers**.

## Vercel project

- Project: `zoom-eats-delivery`
- Domains attached: `zoomeats.com`, `www.zoomeats.com`, `driver.zoomeats.com`, `restaurant.zoomeats.com`

## DNS records to add (Hostinger DNS zone)

| Type | Name / Host | Value | TTL |
|------|-------------|-------|-----|
| **A** | `@` (apex) | `76.76.21.21` | 3600 |
| **CNAME** | `www` | `cname.vercel-dns.com` | 3600 |
| **CNAME** | `driver` | `cname.vercel-dns.com` | 3600 |
| **CNAME** | `restaurant` | `cname.vercel-dns.com` | 3600 |

### Remove / replace

- Remove any **A** record for `@` pointing to `2.57.91.91` (Hostinger parking)
- Remove Hostinger parking **CNAME** records if they conflict

### Optional (Vercel verification)

If Vercel asks for verification, add:

| Type | Name | Value |
|------|------|-------|
| TXT | `_vercel` | `vc-domain-verify=zoomeats.com,UZoMiWHrSw` |

## After DNS propagates (5–60 min)

| URL | App |
|-----|-----|
| https://zoomeats.com | Customer PWA |
| https://driver.zoomeats.com | Driver PWA |
| https://restaurant.zoomeats.com | Restaurant PWA |

`www.zoomeats.com` redirects to `zoomeats.com` (configured in Vercel).

## Already configured

- Supabase `site_url`: `https://zoomeats.com/`
- Auth callbacks for all custom domains
- Vercel env: `NEXT_PUBLIC_SITE_URL=https://zoomeats.com`
- Middleware subdomain routing (driver / restaurant)

## Verify

```bash
dig +short zoomeats.com
dig +short driver.zoomeats.com
curl -I https://zoomeats.com/manifest.webmanifest
```

Expected apex IP: `76.76.21.21`  
Expected subdomains: `cname.vercel-dns.com` chain

## Re-sync auth (if needed)

```bash
NEXT_PUBLIC_SITE_URL=https://zoomeats.com npm run auth:redirects
```
