"""ZoomEats backend integration tests (Supabase Postgres edition)."""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load backend .env for DATABASE_URL
load_dotenv(Path("/app/backend/.env"))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://builder-hub-470.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
DATABASE_URL = os.environ["DATABASE_URL"]


def _conn():
    """Sync psycopg2 connection to the same Supabase Postgres."""
    return psycopg2.connect(DATABASE_URL)


def _run_sql(sql: str, params: tuple = ()):
    with _conn() as c:
        with c.cursor() as cur:
            cur.execute(sql, params)
        c.commit()


def _fetchone(sql: str, params: tuple = ()):
    with _conn() as c:
        with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def make_user(role="customer", email=None):
    """Create user + active session row directly in Postgres."""
    uid = f"test-user-{uuid.uuid4().hex[:8]}"
    token = f"test_session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=7)
    em = email or f"TEST_{uid}@example.com"
    _run_sql(
        "INSERT INTO users (user_id,email,name,picture,role,created_at) VALUES (%s,%s,%s,%s,%s,%s)",
        (uid, em, f"Test {role}", "", role, now),
    )
    _run_sql(
        "INSERT INTO user_sessions (session_token,user_id,expires_at,created_at) VALUES (%s,%s,%s,%s)",
        (token, uid, exp, now),
    )
    return uid, token, {"Authorization": f"Bearer {token}"}


# -------- Fixtures --------
@pytest.fixture(scope="session")
def cust():
    uid, tok, h = make_user("customer")
    yield {"uid": uid, "token": tok, "h": h}

@pytest.fixture(scope="session")
def vendor():
    uid, tok, h = make_user("vendor")
    yield {"uid": uid, "token": tok, "h": h}

@pytest.fixture(scope="session")
def delivery():
    uid, tok, h = make_user("delivery")
    yield {"uid": uid, "token": tok, "h": h}

@pytest.fixture(scope="session")
def admin():
    uid, tok, h = make_user("admin")
    yield {"uid": uid, "token": tok, "h": h}


# -------- Health & restaurants --------
def test_health():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"
    assert j.get("db") == "supabase-postgres"
    assert j.get("app") == "ZoomEats"

def test_list_restaurants_seeded():
    r = requests.get(f"{API}/restaurants")
    assert r.status_code == 200
    rests = r.json()
    names = {x["name"] for x in rests}
    assert {"Terra Verde", "Hachi Roll Co.", "Ember & Oak"}.issubset(names), f"got {names}"

def test_search_sushi():
    r = requests.get(f"{API}/restaurants", params={"q": "sushi"})
    assert r.status_code == 200
    data = r.json()
    assert any("Hachi" in x["name"] for x in data), f"got {[x['name'] for x in data]}"

def test_get_restaurant_with_menu():
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    r = requests.get(f"{API}/restaurants/{rid}")
    assert r.status_code == 200
    payload = r.json()
    assert "restaurant" in payload and "menu" in payload
    assert len(payload["menu"]) > 0


# -------- Auth --------
def test_auth_me_unauth():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401

def test_auth_me_with_token(cust):
    r = requests.get(f"{API}/auth/me", headers=cust["h"])
    assert r.status_code == 200
    assert r.json()["user_id"] == cust["uid"]

def test_role_switch_to_vendor():
    uid, tok, h = make_user("customer")
    r = requests.post(f"{API}/auth/role", headers=h, json={"role": "vendor"})
    assert r.status_code == 200
    assert r.json()["role"] == "vendor"
    # invalid role
    r2 = requests.post(f"{API}/auth/role", headers=h, json={"role": "admin"})
    assert r2.status_code == 400

def test_admin_role_cannot_be_changed(admin):
    r = requests.post(f"{API}/auth/role", headers=admin["h"], json={"role": "vendor"})
    assert r.status_code == 400


# -------- Orders --------
@pytest.fixture(scope="session")
def order(cust):
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    item = menu[0]
    payload = {
        "restaurant_id": rid,
        "items": [{"item_id": item["item_id"], "name": item["name"],
                   "price": item["price"], "quantity": 2, "image_url": ""}],
        "address": "1 Test St",
        "notes": "ring bell",
    }
    r = requests.post(f"{API}/orders", headers=cust["h"], json=payload)
    assert r.status_code == 200, r.text
    return r.json()

def test_order_created_correctly(order):
    assert order["status"] == "pending_payment"
    assert order["payment_status"] == "pending"
    assert order["delivery_fee"] == 2.99
    expected_subtotal = round(order["items"][0]["price"] * order["items"][0]["quantity"], 2)
    assert order["subtotal"] == expected_subtotal
    assert order["total"] == round(expected_subtotal + 2.99, 2)
    # verify items stored as JSONB (round-trip via API)
    assert isinstance(order["items"], list) and len(order["items"]) == 1

def test_orders_my(cust, order):
    r = requests.get(f"{API}/orders/my", headers=cust["h"])
    assert r.status_code == 200
    ids = [o["order_id"] for o in r.json()]
    assert order["order_id"] in ids
    # order by created_at desc — first should be most recent
    assert len(ids) >= 1

def test_get_order_as_customer(cust, order):
    r = requests.get(f"{API}/orders/{order['order_id']}", headers=cust["h"])
    assert r.status_code == 200
    assert r.json()["order_id"] == order["order_id"]

def test_get_order_forbidden_for_other_customer(order):
    _, _, h2 = make_user("customer")
    r = requests.get(f"{API}/orders/{order['order_id']}", headers=h2)
    assert r.status_code == 403

def test_orders_unauth():
    r = requests.post(f"{API}/orders", json={"restaurant_id": "x", "items": [], "address": "a"})
    assert r.status_code == 401


# -------- Stripe checkout --------
def test_checkout_session(cust, order):
    r = requests.post(f"{API}/checkout/session", headers=cust["h"],
                      json={"order_id": order["order_id"], "origin_url": BASE_URL})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "url" in data and "session_id" in data
    sid = data["session_id"]

    # payment_transactions row inserted with payment_status=initiated
    tx = _fetchone("SELECT * FROM payment_transactions WHERE session_id=%s", (sid,))
    assert tx is not None
    assert tx["payment_status"] == "initiated"
    assert tx["order_id"] == order["order_id"]

    # orders.stripe_session_id set
    o = _fetchone("SELECT stripe_session_id FROM orders WHERE order_id=%s", (order["order_id"],))
    assert o["stripe_session_id"] == sid

    # status endpoint — should return 200 even if Stripe lookup fails (soft fallback)
    s = requests.get(f"{API}/checkout/status/{sid}", headers=cust["h"])
    assert s.status_code == 200, s.text
    js = s.json()
    assert "payment_status" in js


# -------- Vendor flow --------
def test_vendor_flow(vendor):
    r = requests.post(f"{API}/vendor/restaurant", headers=vendor["h"],
                      json={"name": "TEST_Vendor Resto", "cuisine": "Test", "description": "d"})
    assert r.status_code == 200, r.text
    rest = r.json()
    assert rest["name"] == "TEST_Vendor Resto"
    rid = rest["restaurant_id"]

    g = requests.get(f"{API}/vendor/restaurant", headers=vendor["h"])
    assert g.status_code == 200 and g.json()["restaurant_id"] == rid

    m = requests.post(f"{API}/vendor/menu-items", headers=vendor["h"],
                      json={"name": "TEST_Item", "price": 9.99})
    assert m.status_code == 200, m.text
    item = m.json()
    assert item["price"] == 9.99

    lst = requests.get(f"{API}/vendor/menu-items", headers=vendor["h"])
    assert lst.status_code == 200 and any(x["item_id"] == item["item_id"] for x in lst.json())

    d = requests.delete(f"{API}/vendor/menu-items/{item['item_id']}", headers=vendor["h"])
    assert d.status_code == 200

    vo = requests.get(f"{API}/vendor/orders", headers=vendor["h"])
    assert vo.status_code == 200 and isinstance(vo.json(), list)


# -------- Delivery flow --------
def test_delivery_flow(delivery, cust):
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    it = menu[0]
    o = requests.post(f"{API}/orders", headers=cust["h"], json={
        "restaurant_id": rid,
        "items": [{"item_id": it["item_id"], "name": it["name"],
                   "price": it["price"], "quantity": 1, "image_url": ""}],
        "address": "x",
    }).json()
    oid = o["order_id"]
    # Mark as paid+ready via direct SQL
    _run_sql("UPDATE orders SET status='ready', payment_status='paid' WHERE order_id=%s", (oid,))

    av = requests.get(f"{API}/delivery/available", headers=delivery["h"])
    assert av.status_code == 200
    assert any(x["order_id"] == oid for x in av.json())

    ac = requests.post(f"{API}/delivery/orders/{oid}/accept", headers=delivery["h"])
    assert ac.status_code == 200

    dv = requests.post(f"{API}/delivery/orders/{oid}/deliver", headers=delivery["h"])
    assert dv.status_code == 200

    final = _fetchone("SELECT status, delivery_partner_id FROM orders WHERE order_id=%s", (oid,))
    assert final["status"] == "delivered"
    assert final["delivery_partner_id"] == delivery["uid"]


# -------- Admin --------
def test_admin_endpoints(admin):
    for path in ["/admin/metrics", "/admin/users", "/admin/restaurants", "/admin/orders"]:
        r = requests.get(f"{API}{path}", headers=admin["h"])
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    # metrics shape
    m = requests.get(f"{API}/admin/metrics", headers=admin["h"]).json()
    for k in ["users", "restaurants", "orders", "paid_orders", "revenue"]:
        assert k in m
    # approve
    rid = requests.get(f"{API}/restaurants").json()[0]["restaurant_id"]
    r = requests.post(f"{API}/admin/restaurants/{rid}/approve", headers=admin["h"])
    assert r.status_code == 200


def test_admin_pulse(admin):
    # activity merged feed
    a = requests.get(f"{API}/admin/activity", headers=admin["h"])
    assert a.status_code == 200, a.text
    events = a.json()
    assert isinstance(events, list)
    assert len(events) <= 30
    if events:
        assert {"type", "title", "description", "when", "id"}.issubset(events[0].keys())
    # attention
    at = requests.get(f"{API}/admin/attention", headers=admin["h"])
    assert at.status_code == 200, at.text
    payload = at.json()
    assert "counts" in payload
    for k in ["pending", "stuck", "failed"]:
        assert k in payload["counts"]
    # digest — calls Claude; may be slow
    time.sleep(1)
    d = requests.get(f"{API}/admin/digest", headers=admin["h"], timeout=60)
    assert d.status_code == 200, d.text
    dj = d.json()
    assert isinstance(dj.get("digest"), str) and len(dj["digest"]) > 0
    assert "stats" in dj


# -------- Role guards --------
def test_role_guards(cust):
    for path in ["/vendor/restaurant", "/delivery/available", "/admin/metrics"]:
        r = requests.get(f"{API}{path}", headers=cust["h"])
        assert r.status_code == 403, f"{path} -> {r.status_code}"


# -------- AI Chat --------
def test_chat_and_history(cust):
    r = requests.post(f"{API}/chat", headers=cust["h"],
                      json={"text": "Suggest something light and Mediterranean."},
                      timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("reply"), str) and len(data["reply"]) > 0
    time.sleep(1)
    h = requests.get(f"{API}/chat/history", headers=cust["h"])
    assert h.status_code == 200
    msgs = h.json()
    assert len(msgs) >= 2
    assert any(m["role"] == "assistant" for m in msgs)
    assert any(m["role"] == "user" for m in msgs)
    # persisted in chat_messages table
    row = _fetchone(
        "SELECT count(*) AS c FROM chat_messages WHERE user_id=%s",
        (cust["uid"],),
    )
    assert row["c"] >= 2
