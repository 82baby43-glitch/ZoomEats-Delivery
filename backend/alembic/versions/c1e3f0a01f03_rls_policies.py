"""Enable Row Level Security (RLS) on all public tables.

Security posture: deny-all for anon / authenticated roles by default.
The backend connects as the `postgres` (table owner) role and BYPASSES RLS,
so all SQLAlchemy queries continue to work unchanged.

The frontend uses the Supabase anon key only for Realtime postgres_changes
subscriptions on `orders`, `deliveries`, and `drivers`. With RLS enabled and
no policies for anon, Realtime will not broadcast row changes to anon
subscribers — preventing cross-user data leaks. The frontend already has a
5-10s polling fallback that keeps the UI live without realtime.

To re-enable realtime selectively (future iteration), add narrowly-scoped
policies that key off a Supabase-signed JWT claim (e.g. `user_id`).
"""
from alembic import op

revision = "c1e3f0a01f03"
down_revision = "b7c2e0a01f02"
branch_labels = None
depends_on = None


TABLES = [
    "users",
    "user_sessions",
    "restaurants",
    "menu_items",
    "orders",
    "payment_transactions",
    "chat_messages",
    "drivers",
    "deliveries",
]


def upgrade() -> None:
    for t in TABLES:
        # Enable RLS — deny-all by default for non-owner roles (anon, authenticated).
        op.execute(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
        # Revoke any previously-granted blanket permissions on anon/authenticated.
        op.execute(f"REVOKE ALL ON public.{t} FROM anon;")
        op.execute(f"REVOKE ALL ON public.{t} FROM authenticated;")


def downgrade() -> None:
    for t in TABLES:
        op.execute(f"ALTER TABLE public.{t} DISABLE ROW LEVEL SECURITY;")
        # Restore default Supabase grants so anon can read public data again.
        op.execute(f"GRANT SELECT ON public.{t} TO anon;")
        op.execute(f"GRANT ALL ON public.{t} TO authenticated;")
