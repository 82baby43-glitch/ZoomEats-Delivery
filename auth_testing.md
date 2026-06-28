# Auth Testing Playbook (Supabase Auth)

## Backend session sync

After Supabase sign-in, the frontend exchanges the Supabase `access_token` for a ZoomEats backend session:

```
POST /api/auth/session
Content-Type: application/json

{ "access_token": "<supabase_access_token>" }
```

The backend verifies the token with Supabase Auth (`GET {SUPABASE_URL}/auth/v1/user`) and returns `{ "user": { ... } }` while setting an HttpOnly `session_token` cookie.

## Step 1: Create test user & session via Postgres

```sql
INSERT INTO users (user_id, email, name, picture, role, created_at)
VALUES ('test-user-001', 'test.user@example.com', 'Test User', '', 'customer', NOW());

INSERT INTO user_sessions (session_token, user_id, expires_at, created_at)
VALUES ('test_session_token_001', 'test-user-001', NOW() + INTERVAL '7 days', NOW());
```

## Step 2: Test backend endpoints

- `GET /api/auth/me` with `Authorization: Bearer <session_token>` OR cookie `session_token=<token>`

## Step 3: Browser testing (Supabase OAuth)

1. Configure Google OAuth in the Supabase project dashboard.
2. Add `{origin}/auth/callback` to Supabase redirect URLs.
3. Click **Sign in** — should redirect through Supabase (not Emergent).
4. After callback, confirm `GET /api/auth/me` returns the user profile.

## Environment variables

**Frontend**

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

**Backend**

- `SUPABASE_URL` (or `REACT_APP_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (or `REACT_APP_SUPABASE_ANON_KEY`)
