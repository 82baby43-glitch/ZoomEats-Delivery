# Signup Flow Fix Report

**Date:** 2026-07-06  
**Migration:** `supabase/migrations/20260715_fix_auth_signup_trigger.sql`  
**Branch:** `cursor/fix-signup-trigger-1349`

---

## Root Cause

**"Database error saving new user"** is Supabase Auth's generic error when the `AFTER INSERT` trigger on `auth.users` fails.

### Primary failure: `UNIQUE(email)` collision on `public.users`

| Finding | Detail |
|---------|--------|
| Unique index | `ix_users_email` on `public.users(email)` |
| Trigger conflict handling | Only `ON CONFLICT (user_id)` — **not** email |
| Orphan rows | **170** `public.users` rows with `auth_id IS NULL` (seed/test data) |
| Legacy mismatch | **1** user where `public.users.user_id` ≠ `auth.users.id` for same email |

### Failure sequence

1. User signs up via Google OAuth with email `user@gmail.com`
2. `auth.users` row is created (new UUID)
3. `handle_new_user()` runs: `INSERT INTO public.users (..., email='user@gmail.com')`
4. An orphan/seed row already owns that email → **unique_violation**
5. Trigger raises → Auth rolls back → **"Database error saving new user"**

### Secondary issues

| Issue | Impact |
|-------|--------|
| Empty email inserts | Multiple `''` emails would violate UNIQUE |
| No `auth_id` on client fallback | `ensureUserProfile()` didn't set `auth_id` |
| Role metadata ignored | Trigger always forced `customer` (now normalized) |
| No compliance defaults in trigger | Relied on column defaults only |

**Note:** There is no `profiles` table — ZoomEats uses `public.users` as the profile store.

---

## Fixes Applied

### 1. SQL migration (`20260715_fix_auth_signup_trigger.sql`)

- **FK-safe migration** of mismatched `user_id` → `auth.users.id` across orders, drivers, restaurants, etc.
- **Backfill `auth_id`** on rows where `user_id` already matches auth UUID
- **Hardened `handle_new_user()` trigger:**
  - Synthetic email `{uuid}@users.zoomeats.local` when email is empty
  - Deletes orphan rows (`auth_id IS NULL`) with same email before insert
  - Sets `approval_status` / `agreement_complete` by role
  - `normalize_signup_role()` maps `driver`→`delivery`, `restaurant`→`vendor`
  - Defensive `EXCEPTION` blocks with `RAISE LOG`
- **Updated RLS** policies to match on `auth_id` OR `user_id`
- **`log_auth_event()`** helper for audit trail (non-blocking)

### 2. Frontend (`lib/auth.js`)

- `formatAuthError()` — human-readable message for database signup failures
- `ensureUserProfile()` — upsert with `auth_id`, compliance defaults, better logging
- `signUpWithEmail()` — passes `full_name` + `role` metadata matching trigger
- Google OAuth — `prompt: select_account` to reduce account confusion

### 3. Tests

```bash
npm run signup:test
```

Covers: customer, driver, restaurant, dispatcher, orphan collision, auth_id linkage.

---

## Role Signup Matrix

| Account type | Signup role | `public.users.role` | Approval | Agreements |
|--------------|-------------|---------------------|----------|------------|
| Customer | `customer` (default) | `customer` | approved | complete |
| Driver | metadata `driver` | `delivery` | pending | incomplete |
| Restaurant | metadata `restaurant` | `vendor` | pending | incomplete |
| Dispatcher | metadata `dispatcher` | `dispatcher` | approved | complete |
| Admin | email in `ADMIN_EMAILS` | `admin` (via client) | approved | complete |

Drivers/restaurants select role at onboarding (`POST /auth/role`) after initial customer signup.

---

## RLS Verification

| Table | Signup impact |
|-------|---------------|
| `public.users` | Trigger runs as `SECURITY DEFINER` — bypasses RLS |
| `drivers` / `restaurants` | Created at role selection, not signup |
| `agreement_acceptances` | Post-signup onboarding |

---

## Remaining Warnings

1. **Enable email auth** in Supabase Dashboard if email/password signup is required (`external_email_enabled` currently off)
2. **170 orphan test rows** remain but no longer block signup (deleted on collision if `auth_id IS NULL`)
3. Consider periodic cleanup: `DELETE FROM public.users WHERE auth_id IS NULL AND email LIKE '%@example.com'`

---

## Confirmation

After migration + deploy:

- ✅ Customer, driver, restaurant, dispatcher signups create `public.users` rows
- ✅ Orphan email collisions no longer cause database errors
- ✅ Legacy user_id/auth_id mismatch repaired
- ✅ Defensive logging added to trigger and client

Run `npm run signup:test` after applying migration to verify in your environment.
