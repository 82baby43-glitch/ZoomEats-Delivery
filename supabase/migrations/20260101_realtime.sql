-- Enable Supabase Realtime broadcasts on dispatch tables.
-- Run once in the SQL editor. Safe to re-run.

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.deliveries;
alter publication supabase_realtime add table public.drivers;
