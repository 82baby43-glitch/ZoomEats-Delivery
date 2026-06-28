# ZoomEats

Production food delivery platform built with **Next.js** (Vercel) and **Supabase** (Auth, Database, Storage, Edge Functions).

## Stack

- **Frontend**: Next.js 15 App Router on Vercel
- **Auth**: Supabase Google OAuth → `/auth/callback`
- **Database**: Supabase Postgres with RLS
- **API**: Supabase Edge Function `api` (replaces legacy FastAPI backend)
- **Realtime**: Supabase Realtime + polling fallback

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.com
```

Edge Function secrets (set via `supabase secrets set`):

```env
STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
ADMIN_EMAILS=
```

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Auth callback URLs:
- Production: `https://zoom-eats-delivery.vercel.app/auth/callback`
- Local: `http://localhost:3000/auth/callback`

## Deploy

1. Push to Vercel (auto-deploys Next.js)
2. Deploy Edge Functions: `supabase functions deploy api dispatch-order`
3. Apply migrations in Supabase SQL Editor (`supabase/migrations/`)
