"""Add dispatch layer: drivers + deliveries tables + new order columns (additive only)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "a5d1c0a01f01"
down_revision = "d2d8d2fb649a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Additive columns on orders (nullable so existing rows stay valid)
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("delivery_type", sa.String(16), nullable=True))
        batch.add_column(sa.Column("driver_id", sa.String(64), nullable=True))
        batch.add_column(sa.Column("tracking_id", sa.String(128), nullable=True))
    op.create_index("ix_orders_driver_id", "orders", ["driver_id"])

    # 2) Drivers table
    op.create_table(
        "drivers",
        sa.Column("driver_id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.user_id", ondelete="CASCADE"),
                  nullable=False, unique=True, index=True),
        sa.Column("availability", sa.Boolean(), nullable=False, server_default=sa.true(), index=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("workload", sa.Integer(), nullable=False, server_default="0", index=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )

    # 3) Deliveries table
    op.create_table(
        "deliveries",
        sa.Column("delivery_id", sa.String(64), primary_key=True),
        sa.Column("order_id", sa.String(64), sa.ForeignKey("orders.order_id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("provider", sa.String(16), nullable=False),  # 'internal' | 'uber'
        sa.Column("tracking_id", sa.String(128), nullable=True),
        sa.Column("eta", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("driver_id", sa.String(64), nullable=True, index=True),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("deliveries")
    op.drop_table("drivers")
    op.drop_index("ix_orders_driver_id", table_name="orders")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("tracking_id")
        batch.drop_column("driver_id")
        batch.drop_column("delivery_type")
