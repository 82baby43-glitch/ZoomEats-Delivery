-- ZoomEats RLS posture (idempotent — safe to re-run)
-- Run AFTER `20260101_realtime.sql`.
--
-- Effect: deny-all for anon / authenticated roles on every public table.
-- The backend connects as the `postgres` (table-owner) role which bypasses RLS,
-- so SQLAlchemy continues to work unchanged.
--
-- Frontend Realtime subscriptions via the anon key will no longer broadcast
-- row changes (which prevents cross-user data leaks). The frontend's existing
-- 5-10s polling fallback keeps the UI live.

do $$
declare
  t text;
begin
  foreach t in array array[
    'users','user_sessions','restaurants','menu_items','orders',
    'payment_transactions','chat_messages','drivers','deliveries'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('revoke all on public.%I from authenticated;', t);
  end loop;
end$$;
