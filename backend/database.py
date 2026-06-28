"""Async SQLAlchemy engine + session factory for Supabase Postgres."""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from env import database_url  # loads backend + frontend .env on import

DATABASE_URL = database_url()
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy backend/.env.example → backend/.env and paste "
        "your Supabase Transaction pooler URI (Dashboard → Database → Connection string)."
    )

ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=10,
    max_overflow=5,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=False,
    echo=False,
    connect_args={
        "statement_cache_size": 0,  # required for transaction pooler
        "command_timeout": 30,
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
