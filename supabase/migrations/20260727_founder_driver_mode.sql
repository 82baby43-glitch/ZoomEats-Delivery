-- ZoomEats Founder Driver Mode — additive internal ops analytics (does NOT alter normal driver logic)

alter table public.users
  add column if not exists founder_driver boolean not null default false,
  add column if not exists founder_driver_role text check (founder_driver_role in ('founder', 'ceo', 'ops_admin', 'qa'));

comment on column public.users.founder_driver is 'Internal permission: may enable Founder Driver Mode';
comment on column public.users.founder_driver_role is 'Internal ops role label for founder driver analytics';

-- Grant founder_driver to existing admins
update public.users
set founder_driver = true,
    founder_driver_role = coalesce(founder_driver_role, 'founder')
where role = 'admin' and founder_driver is distinct from true;

create table if not exists public.founder_driver_sessions (
  session_id text primary key,
  user_id text not null,
  founder_role text,
  shadow_dispatch boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_founder_driver_sessions_user on public.founder_driver_sessions (user_id, started_at desc);

create table if not exists public.founder_pickup_logs (
  log_id text primary key,
  user_id text not null,
  order_id text not null,
  restaurant_id text not null,
  arrival_at timestamptz,
  food_ready_at timestamptz,
  pickup_at timestamptz,
  wait_minutes numeric(6,2),
  employee_interaction_rating int check (employee_interaction_rating between 1 and 5),
  pickup_difficulty text check (pickup_difficulty in ('easy', 'medium', 'hard')),
  parking_difficulty text check (parking_difficulty in ('easy', 'medium', 'hard')),
  order_accuracy text check (order_accuracy in ('accurate', 'minor_issue', 'wrong_items')),
  special_notes text,
  recommendation text,
  created_at timestamptz not null default now()
);

create index if not exists idx_founder_pickup_restaurant on public.founder_pickup_logs (restaurant_id, created_at desc);
create index if not exists idx_founder_pickup_order on public.founder_pickup_logs (order_id);

create table if not exists public.founder_delivery_journals (
  journal_id text primary key,
  user_id text not null,
  order_id text not null,
  dispatch_rating int check (dispatch_rating between 1 and 5),
  navigation_rating int check (navigation_rating between 1 and 5),
  restaurant_rating int check (restaurant_rating between 1 and 5),
  customer_rating int check (customer_rating between 1 and 5),
  parking text check (parking in ('easy', 'medium', 'hard')),
  safety text check (safety in ('safe', 'moderate', 'unsafe')),
  notes text,
  platform_revenue numeric(10,2),
  driver_pay numeric(10,2),
  tip numeric(10,2),
  miles numeric(8,2),
  delivery_minutes int,
  effective_hourly numeric(10,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_founder_journal_user on public.founder_delivery_journals (user_id, created_at desc);

create table if not exists public.founder_dispatch_insights (
  insight_id text primary key,
  order_id text not null,
  user_id text,
  assigned_driver_id text,
  dispatch_score numeric(6,2),
  score_breakdown jsonb not null default '{}'::jsonb,
  decision_reason text,
  rejected_drivers jsonb not null default '[]'::jsonb,
  estimated_payout numeric(10,2),
  estimated_wait_min numeric(6,2),
  profit_prediction numeric(10,2),
  dispatch_confidence numeric(5,2),
  shadow_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_founder_dispatch_order on public.founder_dispatch_insights (order_id, created_at desc);

create table if not exists public.founder_order_notes (
  note_id text primary key,
  user_id text not null,
  order_id text,
  restaurant_id text,
  note text not null,
  visibility text not null default 'admin' check (visibility in ('admin')),
  created_at timestamptz not null default now()
);

create index if not exists idx_founder_notes_user on public.founder_order_notes (user_id, created_at desc);

create table if not exists public.founder_feature_feedback (
  feedback_id text primary key,
  user_id text not null,
  order_id text,
  category text not null,
  problem text not null,
  suggested_fix text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'triaged', 'roadmap', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists idx_founder_feedback_status on public.founder_feature_feedback (status, created_at desc);

create table if not exists public.founder_customer_reviews (
  review_id text primary key,
  user_id text not null,
  order_id text not null,
  instructions_clarity int check (instructions_clarity between 1 and 5),
  delivery_accuracy int check (delivery_accuracy between 1 and 5),
  photo_quality int check (photo_quality between 1 and 5),
  apartment_complexity text check (apartment_complexity in ('easy', 'medium', 'hard')),
  dropoff_safety text check (dropoff_safety in ('safe', 'moderate', 'unsafe')),
  navigation_quality int check (navigation_quality between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_scorecard (
  restaurant_id text primary key,
  sample_count int not null default 0,
  avg_wait_min numeric(6,2),
  avg_order_accuracy numeric(5,2),
  avg_packaging numeric(5,2),
  avg_driver_friendliness numeric(5,2),
  avg_parking numeric(5,2),
  avg_pickup_speed numeric(5,2),
  tablet_usage_score numeric(5,2),
  prep_reliability numeric(5,2),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_shadow_dispatches (
  shadow_id text primary key,
  order_id text not null,
  user_id text not null,
  recommendation jsonb not null default '{}'::jsonb,
  alternatives jsonb not null default '[]'::jsonb,
  accepted boolean,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.founder_driver_sessions enable row level security;
alter table public.founder_pickup_logs enable row level security;
alter table public.founder_delivery_journals enable row level security;
alter table public.founder_dispatch_insights enable row level security;
alter table public.founder_order_notes enable row level security;
alter table public.founder_feature_feedback enable row level security;
alter table public.founder_customer_reviews enable row level security;
alter table public.restaurant_scorecard enable row level security;
alter table public.founder_shadow_dispatches enable row level security;

grant select, insert, update on public.founder_driver_sessions to authenticated;
grant select, insert, update on public.founder_pickup_logs to authenticated;
grant select, insert, update on public.founder_delivery_journals to authenticated;
grant select, insert on public.founder_dispatch_insights to authenticated;
grant select, insert on public.founder_order_notes to authenticated;
grant select, insert, update on public.founder_feature_feedback to authenticated;
grant select, insert on public.founder_customer_reviews to authenticated;
grant select on public.restaurant_scorecard to authenticated;
grant select, insert, update on public.founder_shadow_dispatches to authenticated;

grant all on public.founder_driver_sessions to service_role;
grant all on public.founder_pickup_logs to service_role;
grant all on public.founder_delivery_journals to service_role;
grant all on public.founder_dispatch_insights to service_role;
grant all on public.founder_order_notes to service_role;
grant all on public.founder_feature_feedback to service_role;
grant all on public.founder_customer_reviews to service_role;
grant all on public.restaurant_scorecard to service_role;
grant all on public.founder_shadow_dispatches to service_role;
