"""Dispatch layer tests — driver tracking + autonomous assignment + Uber fallback."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path("/app/backend/.env"))
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
DATABASE_URL = os.environ["DATABASE_URL"]


# ---------- DB helpers ----------
def _conn():
    return psycopg2.connect(DATABASE_URL)


def _run(sql, params=()):
    with _conn() as c:
        with c.cursor() as cur:
            cur.execute(sql, params)
        c.commit()


def _one(sql, params=()):
    with _conn() as c:
        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def _all(sql, params=()):
    with _conn() as c:
        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def make_user(role="customer"):
    uid = f"test-user-{uuid.uuid4().hex[:8]}"
    token = f"test_session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=7)
    em = f"TEST_{uid}@example.com"
    _run("INSERT INTO users (user_id,email,name,picture,role,created_at) VALUES (%s,%s,%s,%s,%s,%s)",
         (uid, em, f"Test {role}", "", role, now))
    _run("INSERT INTO user_sessions (session_token,user_id,expires_at,created_at) VALUES (%s,%s,%s,%s)",
         (token, uid, exp, now))
    return uid, token, {"Authorization": f"Bearer {token}"}


# Tracks all rows we create so we can clean up.
_created = {"users": set(), "drivers": set(), "orders": set(), "deliveries": set()}


def _seed_paid_order(customer_id: str):
    rid = requests.get(f"{API}/restaurants").json()[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    it = menu[0]
    oid = f"test-ord-{uuid.uuid4().hex[:10]}"
    _run("""INSERT INTO orders (order_id,customer_id,customer_name,restaurant_id,restaurant_name,
            items,subtotal,delivery_fee,total,address,notes,status,payment_status,created_at)
            VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s)""",
         (oid, customer_id, "TEST cust", rid, "TEST_resto",
          '[{"item_id":"x","name":"x","price":10.0,"quantity":1}]',
          10.0, 2.99, 12.99, "1 Test St", "", "placed", "paid",
          datetime.now(timezone.utc)))
    _created["orders"].add(oid)
    return oid, rid


# ---------- Cleanup at end of session ----------
@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    for did in list(_created["deliveries"]):
        _run("DELETE FROM deliveries WHERE delivery_id=%s", (did,))
    for oid in list(_created["orders"]):
        _run("DELETE FROM deliveries WHERE order_id=%s", (oid,))
        _run("DELETE FROM orders WHERE order_id=%s", (oid,))
    for drv in list(_created["drivers"]):
        _run("DELETE FROM drivers WHERE driver_id=%s", (drv,))
    # Drivers may also be auto-created via user_id; clean orphans for our test users
    for uid in list(_created["users"]):
        _run("DELETE FROM drivers WHERE user_id=%s", (uid,))
        _run("DELETE FROM user_sessions WHERE user_id=%s", (uid,))
        _run("DELETE FROM users WHERE user_id=%s", (uid,))


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin():
    uid, tok, h = make_user("admin")
    _created["users"].add(uid)
    return {"uid": uid, "h": h, "token": tok}


@pytest.fixture(scope="module")
def customer():
    uid, tok, h = make_user("customer")
    _created["users"].add(uid)
    return {"uid": uid, "h": h, "token": tok}


@pytest.fixture
def fresh_driver_user():
    uid, tok, h = make_user("delivery")
    _created["users"].add(uid)
    return {"uid": uid, "h": h, "token": tok}


# ---------- Schema sanity ----------
def test_driver_table_schema():
    cols = {c["column_name"] for c in _all(
        "SELECT column_name FROM information_schema.columns WHERE table_name='drivers'")}
    needed = {"driver_id", "user_id", "availability", "latitude", "longitude",
              "workload", "last_seen", "created_at"}
    assert needed.issubset(cols), f"missing {needed - cols}"


def test_delivery_table_schema():
    cols = {c["column_name"] for c in _all(
        "SELECT column_name FROM information_schema.columns WHERE table_name='deliveries'")}
    needed = {"delivery_id", "order_id", "provider", "tracking_id", "eta",
              "status", "driver_id", "meta", "created_at", "updated_at"}
    assert needed.issubset(cols), f"missing {needed - cols}"


def test_orders_dispatch_columns():
    cols = {c["column_name"] for c in _all(
        "SELECT column_name FROM information_schema.columns WHERE table_name='orders'")}
    assert {"delivery_type", "driver_id", "tracking_id"}.issubset(cols)


# ---------- Driver endpoints ----------
def test_driver_location_creates_row(fresh_driver_user):
    r = requests.post(f"{API}/driver/location", headers=fresh_driver_user["h"],
                      json={"latitude": 38.9517, "longitude": -92.3341})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["driver_id"].startswith("drv_")
    assert "last_seen" in data
    # Verify in DB
    row = _one("SELECT * FROM drivers WHERE user_id=%s", (fresh_driver_user["uid"],))
    assert row is not None
    assert abs(row["latitude"] - 38.9517) < 1e-6
    assert abs(row["longitude"] - (-92.3341)) < 1e-6
    assert row["last_seen"] is not None


def test_driver_availability_toggle(fresh_driver_user):
    # First call creates row
    requests.post(f"{API}/driver/location", headers=fresh_driver_user["h"],
                  json={"latitude": 38.95, "longitude": -92.33})
    r = requests.post(f"{API}/driver/availability", headers=fresh_driver_user["h"],
                      json={"available": False})
    assert r.status_code == 200
    assert r.json()["available"] is False
    row = _one("SELECT availability FROM drivers WHERE user_id=%s", (fresh_driver_user["uid"],))
    assert row["availability"] is False
    # Toggle on
    r2 = requests.post(f"{API}/driver/availability", headers=fresh_driver_user["h"],
                       json={"available": True})
    assert r2.status_code == 200
    assert r2.json()["available"] is True


def test_driver_active_returns_orders(fresh_driver_user, customer):
    # heartbeat to create driver
    requests.post(f"{API}/driver/location", headers=fresh_driver_user["h"],
                  json={"latitude": 38.95, "longitude": -92.33})
    drv = _one("SELECT driver_id FROM drivers WHERE user_id=%s", (fresh_driver_user["uid"],))
    drv_id = drv["driver_id"]
    # Manually assign an order to this driver
    oid, _ = _seed_paid_order(customer["uid"])
    _run("UPDATE orders SET driver_id=%s, status='assigned_internal', delivery_type='internal', tracking_id=%s WHERE order_id=%s",
         (drv_id, f"int_{uuid.uuid4().hex[:10]}", oid))
    r = requests.get(f"{API}/driver/active", headers=fresh_driver_user["h"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["driver"]["driver_id"] == drv_id
    ids = [o["order_id"] for o in data["orders"]]
    assert oid in ids


# ---------- Auth guards ----------
def test_driver_endpoints_require_delivery_role(customer):
    r = requests.post(f"{API}/driver/location", headers=customer["h"],
                      json={"latitude": 0, "longitude": 0})
    assert r.status_code == 403


def test_driver_endpoints_unauth():
    r = requests.post(f"{API}/driver/location", json={"latitude": 0, "longitude": 0})
    assert r.status_code == 401


def test_dispatch_trigger_requires_admin(customer):
    r = requests.post(f"{API}/dispatch/trigger/nonexistent", headers=customer["h"])
    assert r.status_code == 403


def test_dispatch_trigger_unauth():
    r = requests.post(f"{API}/dispatch/trigger/nonexistent")
    assert r.status_code == 401


# ---------- End-to-end dispatch: internal ----------
def test_dispatch_internal_assignment(admin, customer):
    # Create a fresh delivery user + driver row near CoMo
    uid, tok, h = make_user("delivery")
    _created["users"].add(uid)
    # heartbeat to register driver
    rr = requests.post(f"{API}/driver/location", headers=h,
                       json={"latitude": 38.9517, "longitude": -92.3341})
    assert rr.status_code == 200
    drv_id = rr.json()["driver_id"]
    workload_before = _one("SELECT workload FROM drivers WHERE driver_id=%s", (drv_id,))["workload"]

    oid, _ = _seed_paid_order(customer["uid"])
    r = requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["delivery_type"] == "internal"
    assert data["tracking_id"].startswith("int_")
    assert data["status"] == "assigned_internal"

    # Order updated
    o = _one("SELECT status,delivery_type,driver_id,tracking_id FROM orders WHERE order_id=%s", (oid,))
    assert o["status"] == "assigned_internal"
    assert o["delivery_type"] == "internal"
    assert o["tracking_id"].startswith("int_")
    # Driver chosen may be the test driver OR an existing nearby driver — just assert one was picked
    assert o["driver_id"] is not None

    # Delivery row created
    d = _one("SELECT provider,tracking_id,status FROM deliveries WHERE order_id=%s", (oid,))
    assert d is not None
    assert d["provider"] == "internal"
    assert d["tracking_id"] == o["tracking_id"]

    # Workload increment of *some* driver (could be our test driver or another)
    # If our test driver was picked, check exact increment.
    if o["driver_id"] == drv_id:
        workload_after = _one("SELECT workload FROM drivers WHERE driver_id=%s", (drv_id,))["workload"]
        assert workload_after == workload_before + 1


# ---------- Idempotency ----------
def test_dispatch_idempotent(admin, customer):
    uid, tok, h = make_user("delivery")
    _created["users"].add(uid)
    requests.post(f"{API}/driver/location", headers=h,
                  json={"latitude": 38.9517, "longitude": -92.3341})

    oid, _ = _seed_paid_order(customer["uid"])
    r1 = requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"]).json()
    assert r1["ok"] is True
    r2 = requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"]).json()
    assert r2.get("ok") is True
    assert r2.get("already") is True

    # State unchanged
    o = _one("SELECT status,delivery_type FROM orders WHERE order_id=%s", (oid,))
    assert o["status"] in ("assigned_internal", "assigned_uber")
    # Only one delivery row
    rows = _all("SELECT delivery_id FROM deliveries WHERE order_id=%s", (oid,))
    assert len(rows) == 1


# ---------- Guard: unpaid order ----------
def test_dispatch_guards_unpaid(admin, customer):
    rid = requests.get(f"{API}/restaurants").json()[0]["restaurant_id"]
    oid = f"test-ord-{uuid.uuid4().hex[:10]}"
    _run("""INSERT INTO orders (order_id,customer_id,restaurant_id,items,subtotal,delivery_fee,total,
            address,status,payment_status,created_at) VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s)""",
         (oid, customer["uid"], rid, "[]", 0.0, 2.99, 2.99, "x",
          "pending_payment", "pending", datetime.now(timezone.utc)))
    _created["orders"].add(oid)
    r = requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"])
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is False
    assert data["reason"] == "not_paid"


# ---------- End-to-end dispatch: Uber fallback ----------
def test_dispatch_uber_fallback(admin, customer):
    # Mark all available drivers offline first so dispatch must fall back to Uber
    _run("UPDATE drivers SET availability=false WHERE availability=true")
    try:
        oid, _ = _seed_paid_order(customer["uid"])
        r = requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["delivery_type"] == "uber"
        assert data["tracking_id"].startswith("stub_")

        o = _one("SELECT status,delivery_type,tracking_id FROM orders WHERE order_id=%s", (oid,))
        assert o["status"] == "assigned_uber"
        assert o["delivery_type"] == "uber"
        assert o["tracking_id"].startswith("stub_")

        d = _one("SELECT provider,status,tracking_id FROM deliveries WHERE order_id=%s", (oid,))
        assert d["provider"] == "uber"
        # status depends on whether real Uber Direct credentials are configured:
        # - blank creds → 'pending_credentials' (stub path)
        # - real creds  → engine attempts a live POST which may resolve to 'pending'
        #                 or 'create_failed' depending on sandbox response
        assert d["status"] in {"pending_credentials", "pending", "create_failed"}, d["status"]
        assert d["tracking_id"].startswith("stub_")
    finally:
        # Restore availability (best-effort) for any pre-existing drivers
        _run("UPDATE drivers SET availability=true WHERE user_id LIKE 'test-user-%%' IS FALSE")


# ---------- Order tracking endpoint ----------
def test_order_tracking_customer_access(admin, customer):
    oid, _ = _seed_paid_order(customer["uid"])
    # Trigger dispatch to populate delivery row
    requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"])
    r = requests.get(f"{API}/orders/{oid}/tracking", headers=customer["h"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["order"]["order_id"] == oid
    assert data["delivery_type"] in ("internal", "uber")
    assert data["tracking_id"]
    assert data["delivery"] is not None


def test_order_tracking_forbidden_for_other_customer(admin, customer):
    oid, _ = _seed_paid_order(customer["uid"])
    requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"])
    other_uid, _, other_h = make_user("customer")
    _created["users"].add(other_uid)
    r = requests.get(f"{API}/orders/{oid}/tracking", headers=other_h)
    assert r.status_code == 403


def test_order_tracking_admin_access(admin, customer):
    oid, _ = _seed_paid_order(customer["uid"])
    requests.post(f"{API}/dispatch/trigger/{oid}", headers=admin["h"])
    r = requests.get(f"{API}/orders/{oid}/tracking", headers=admin["h"])
    assert r.status_code == 200


def test_order_tracking_unauth():
    r = requests.get(f"{API}/orders/anything/tracking")
    assert r.status_code == 401
