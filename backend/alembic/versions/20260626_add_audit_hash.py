"""Add chained_hash to audit_logs
"""
from alembic import op
import sqlalchemy as sa

revision = "20260626_add_audit_hash"
down_revision = "20260626_add_agreements_compliance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('audit_logs') as batch:
        batch.add_column(sa.Column('chained_hash', sa.String(length=128), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audit_logs') as batch:
        batch.drop_column('chained_hash')
