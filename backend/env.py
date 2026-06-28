"""Load ZoomEats environment from backend and frontend .env files."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent

# Backend secrets first; frontend .env supplies REACT_APP_* Supabase fallbacks.
load_dotenv(WORKSPACE / "backend" / ".env")
load_dotenv(WORKSPACE / "frontend" / ".env")


def supabase_url() -> str:
    return (os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL", "")).rstrip("/")


def supabase_anon_key() -> str:
    return os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("REACT_APP_SUPABASE_ANON_KEY", "")


def supabase_service_role_key() -> str:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def database_url() -> str:
    return os.environ.get("DATABASE_URL", "")


def supabase_configured() -> bool:
    return bool(supabase_url() and supabase_anon_key())
