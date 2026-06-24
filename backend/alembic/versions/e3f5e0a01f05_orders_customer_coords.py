"""Add orders.customer_lat / customer_lng — cache geocoded dropoff coords.

Previously /api/orders/{oid}/tracking re-geocoded the address via Nominatim on
every poll (~8s cadence). Nominatim caps at 1 req/s and bans on abuse. By
caching the result on the order row at first lookup, subsequent polls are free.
"""
from alembic import op
import sqlalchemy as sa

revision = "e3f5e0a01f05"
down_revision = "d2f4e0a01f04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("customer_lat", sa.Float(), nullable=True))
        batch.add_column(sa.Column("customer_lng", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("customer_lng")
        batch.drop_column("customer_lat")
