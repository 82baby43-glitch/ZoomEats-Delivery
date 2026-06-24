"""Add orders.price_hash — tamper-evident sha256 snapshot of repriced cart lines.

Computed at order-create time from the canonical (server-side) item_id+price+qty+name
JSON. Lets an admin later verify that the stored items JSONB hasn't been tampered with
post-checkout (refund disputes, audit, etc.). Nullable so existing rows stay valid.
"""
from alembic import op
import sqlalchemy as sa

revision = "d2f4e0a01f04"
down_revision = "c1e3f0a01f03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("price_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("price_hash")
