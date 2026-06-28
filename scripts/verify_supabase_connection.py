#!/usr/bin/env python3
"""Verify Supabase Auth + Postgres connectivity for ZoomEats."""
import sys
import urllib.error
import urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from env import database_url, supabase_anon_key, supabase_configured, supabase_url


def check_auth() -> bool:
    if not supabase_configured():
        print("FAIL  Supabase Auth — SUPABASE_URL / SUPABASE_ANON_KEY not set")
        print("      Copy backend/.env.example → backend/.env (or set vars in frontend/.env)")
        return False

    try:
        req = urllib.request.Request(
            f"{supabase_url()}/auth/v1/health",
            headers={"apikey": supabase_anon_key()},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                print(f"OK    Supabase Auth — {supabase_url()}")
                return True
        print(f"FAIL  Supabase Auth health — unexpected status")
        return False
    except urllib.error.HTTPError as exc:
        print(f"FAIL  Supabase Auth health — HTTP {exc.code}")
        return False
    except Exception as exc:
        print(f"FAIL  Supabase Auth — {exc}")
        return False


def check_postgres() -> bool:
    url = database_url()
    if not url:
        print("WARN  Postgres — DATABASE_URL not set (see backend/.env.example)")
        return False

    try:
        import psycopg2

        with psycopg2.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        print("OK    Postgres — connected via DATABASE_URL")
        return True
    except ImportError:
        print("WARN  Postgres — psycopg2 not installed, skipping DB check")
        return False
    except Exception as exc:
        print(f"FAIL  Postgres — {exc}")
        return False


def main() -> int:
    print("ZoomEats Supabase connection check\n")
    auth_ok = check_auth()
    db_ok = check_postgres()
    print()
    if auth_ok and db_ok:
        print("All checks passed.")
        return 0
    if auth_ok:
        print("Auth connected. Add DATABASE_URL to fully connect the backend.")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
