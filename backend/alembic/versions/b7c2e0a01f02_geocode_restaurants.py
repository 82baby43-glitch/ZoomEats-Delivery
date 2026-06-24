"""Add lat/lng to restaurants + validation flag (additive, nullable)."""
from alembic import op
import sqlalchemy as sa

revision = "b7c2e0a01f02"
down_revision = "a5d1c0a01f01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("restaurants") as batch:
        batch.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("longitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("address_validated", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("restaurants") as batch:
        batch.drop_column("address_validated")
        batch.drop_column("longitude")
        batch.drop_column("latitude")
