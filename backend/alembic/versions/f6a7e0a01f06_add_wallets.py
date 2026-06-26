"""Add wallet tables and stripe_account_id to drivers/restaurants

Adds `wallets`, `wallet_transactions`, `wallet_payouts` tables and `stripe_account_id`
columns for drivers and restaurants.
"""
from alembic import op
import sqlalchemy as sa

revision = "f6a7e0a01f06"
down_revision = "e3f5e0a01f05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('drivers', sa.Column('stripe_account_id', sa.String(length=128), nullable=True))
    op.add_column('restaurants', sa.Column('stripe_account_id', sa.String(length=128), nullable=True))

    op.create_table(
        'wallets',
        sa.Column('wallet_id', sa.String(length=64), primary_key=True),
        sa.Column('owner_user_id', sa.String(length=64), nullable=False),
        sa.Column('owner_type', sa.String(length=32), nullable=False),
        sa.Column('available', sa.Float(), nullable=False, server_default='0'),
        sa.Column('pending', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'wallet_transactions',
        sa.Column('tx_id', sa.String(length=64), primary_key=True),
        sa.Column('wallet_id', sa.String(length=64), nullable=False),
        sa.Column('order_id', sa.String(length=64), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'wallet_payouts',
        sa.Column('payout_id', sa.String(length=64), primary_key=True),
        sa.Column('wallet_id', sa.String(length=64), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False),
        sa.Column('stripe_payout_id', sa.String(length=128), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('wallet_payouts')
    op.drop_table('wallet_transactions')
    op.drop_table('wallets')
    with op.batch_alter_table('restaurants') as batch:
        batch.drop_column('stripe_account_id')
    with op.batch_alter_table('drivers') as batch:
        batch.drop_column('stripe_account_id')
