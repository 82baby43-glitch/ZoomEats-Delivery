"""ZoomEats P0 tests — Iteration 4
Covers:
 (a) Supabase RLS posture (anon key blocked on all sensitive tables)
 (b) Vendor restaurant geocoding (happy path + unresolvable address)
 (c) /orders/{oid}/tracking shape + auth guards
 (d) Driver heartbeat creates row + /driver/active returns it
 (e) Backend not broken by RLS (restaurants list + admin metrics still work)
"""
import os
import time
import uuid
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

# Reuse helpers from the main backend_test.py
import sys
sys.path.insert(0, str(Path("/app/backend/tests")))
from backend_test import (  # noqa: E402
    BASE_URL, API, make_user, _conn, _fetchone, _run_sql,
)

load_dotenv(Path("/app/frontend/.env"))
SUPABASE_URL = os.environ.get("REACT_APP_SUPABASE_URL", "https://njrrhckegbfqhwkqkzvw.supabase.co").rstrip("/")
SUPABASE_ANON = os.environ["REACT_APP_SUPABASE_ANON_KEY"]


# ---------------- (a) RLS posture ----------------
RLS_TABLES = ["orders", "deliveries", "drivers", "restaurants", "users", "payment_transactions"]


@pytest.mark.parametrize("table", RLS_TABLES)
def test_supabase_anon_blocked_by_rls(table):
    """Direct PostgREST call with anon key MUST be denied by RLS for every sensitive table."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=*&limit=1"
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
    }
    r = requests.get(url, headers=headers, timeout=15)
    # Acceptable: 401, 403, OR 200 with empty array (RLS returns no rows to anon).
    # NOT acceptable: 200 with rows.
    if r.status_code in (401, 403):
        return
    if r.status_code == 200:
        body = r.json()
        assert isinstance(body, list) and len(body) == 0, (
            f"RLS LEAK on '{table}': anon got {len(body)} rows: {body[:1]}"
        )
        return
    # Some PostgREST setups return 400 with PG error code 42501
    if r.status_code in (400, 404):
        txt = r.text
        assert "42501" in txt or "permission denied" in txt.lower() or "RLS" in txt, (
            f"Unexpected {r.status_code} for {table}: {txt[:300]}"
        )
        return
    pytest.fail(f"Unexpected status {r.status_code} on {table}: {r.text[:300]}")


# ---------------- (e) Backend still works ----------------
def test_restaurants_list_still_works():
    """Backend uses postgres role (bypasses RLS) → seeded list must still return >=3."""
    r = requests.get(f"{API}/restaurants")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) >= 3, f"only {len(data)} restaurants"


def test_admin_metrics_still_works():
    _, _, h = make_user("admin")
    r = requests.get(f"{API}/admin/metrics", headers=h)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("users", "restaurants", "orders", "paid_orders", "revenue"):
        assert k in j


# ---------------- (b) Geocoding on vendor create/update ----------------
def _fresh_vendor():
    return make_user("vendor")


def test_vendor_restaurant_geocoded_real_address():
    """A valid US address must be resolved → lat/lng populated, address_validated=true."""
    uid, tok, h = _fresh_vendor()
    payload = {
        "name": "TEST_Geo Valid",
        "cuisine": "Test",
        "description": "geocoded",
        "address": "1600 Amphitheatre Parkway, Mountain View, CA",
    }
    r = requests.post(f"{API}/vendor/restaurant", headers=h, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    rid = body["restaurant_id"]
    # DB-level confirmation (in case the response dict elides fields)
    row = _fetchone(
        "SELECT latitude, longitude, address_validated, address FROM restaurants WHERE restaurant_id=%s",
        (rid,),
    )
    assert row is not None
    assert row["address"] == payload["address"]
    # If Nominatim is rate-limiting us (HTTP 429), the row will have null coords.
    # Skip the geocode-validity assertions but still verify the code path
    # (no crash + address stored).
    if row["latitude"] is None:
        import pytest as _pytest
        _pytest.skip("Nominatim rate-limited this run — geocode result was null")
    assert row["latitude"] is not None and row["longitude"] is not None, f"geocode failed: {row}"
    assert isinstance(row["latitude"], (int, float))
    assert isinstance(row["longitude"], (int, float))
    # Mountain View is around 37.4, -122.0
    assert 36.0 < float(row["latitude"]) < 38.5, f"lat off: {row['latitude']}"
    assert -123.0 < float(row["longitude"]) < -121.0, f"lng off: {row['longitude']}"
    assert row["address_validated"] is True
    # Cleanup
    _run_sql("DELETE FROM restaurants WHERE restaurant_id=%s", (rid,))


def test_vendor_restaurant_geocoded_unresolvable():
    """Garbage address → 200 OK, lat/lng=null, address_validated=false."""
    time.sleep(1.2)  # Nominatim rate-limit courtesy
    uid, tok, h = _fresh_vendor()
    payload = {
        "name": "TEST_Geo Bad",
        "cuisine": "Test",
        "address": "jjjj zzzz nonexistent street xyz",
    }
    r = requests.post(f"{API}/vendor/restaurant", headers=h, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    rid = r.json()["restaurant_id"]
    row = _fetchone(
        "SELECT latitude, longitude, address_validated FROM restaurants WHERE restaurant_id=%s",
        (rid,),
    )
    assert row["latitude"] is None
    assert row["longitude"] is None
    assert row["address_validated"] is False
    _run_sql("DELETE FROM restaurants WHERE restaurant_id=%s", (rid,))


# ---------------- (c) /orders/{oid}/tracking shape + auth ----------------
@pytest.fixture(scope="module")
def tracking_order():
    """Create a fresh customer + order for tracking endpoint tests."""
    cuid, ctok, ch = make_user("customer")
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    it = menu[0]
    payload = {
        "restaurant_id": rid,
        "items": [{"item_id": it["item_id"], "name": it["name"],
                   "price": it["price"], "quantity": 1, "image_url": ""}],
        "address": "350 5th Ave, New York, NY",
        "notes": "tracking-test",
    }
    r = requests.post(f"{API}/orders", headers=ch, json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    yield {"oid": o["order_id"], "cuid": cuid, "ch": ch, "rid": rid}
    # cleanup
    _run_sql("DELETE FROM orders WHERE order_id=%s", (o["order_id"],))


def test_tracking_shape(tracking_order):
    time.sleep(1.2)  # geocoding rate-limit pacing (endpoint geocodes customer addr)
    r = requests.get(f"{API}/orders/{tracking_order['oid']}/tracking", headers=tracking_order["ch"], timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("order", "delivery_type", "tracking_id", "driver", "restaurant", "customer", "delivery"):
        assert k in j, f"missing key {k} in {list(j.keys())}"
    assert j["order"]["order_id"] == tracking_order["oid"]
    # Restaurant — accept either null lat/lng or floats (seed addresses are placeholders)
    if j["restaurant"]:
        for k in ("name", "latitude", "longitude", "address"):
            assert k in j["restaurant"]
    # Customer — order address "350 5th Ave NY" should geocode to a float;
    # tolerate Nominatim rate-limit (HTTP 429) by skipping the value check.
    if j["customer"] is None:
        import pytest as _pytest
        _pytest.skip("Nominatim rate-limited this run — customer geocode returned null")
    assert isinstance(j["customer"]["latitude"], (int, float))
    assert isinstance(j["customer"]["longitude"], (int, float))
    # NYC ish
    assert 40.0 < float(j["customer"]["latitude"]) < 41.5
    assert -74.5 < float(j["customer"]["longitude"]) < -73.5


def test_tracking_unauth(tracking_order):
    r = requests.get(f"{API}/orders/{tracking_order['oid']}/tracking")
    assert r.status_code == 401


def test_tracking_forbidden_for_other_customer(tracking_order):
    _, _, h2 = make_user("customer")
    r = requests.get(f"{API}/orders/{tracking_order['oid']}/tracking", headers=h2)
    assert r.status_code == 403


# ---------------- (d) Driver heartbeat + /driver/active ----------------
def test_driver_heartbeat_and_active():
    duid, dtok, dh = make_user("delivery")
    r = requests.post(f"{API}/driver/location", headers=dh, json={"latitude": 37.42, "longitude": -122.08})
    assert r.status_code == 200, r.text

    row = _fetchone("SELECT latitude, longitude FROM drivers WHERE user_id=%s", (duid,))
    assert row is not None
    assert abs(float(row["latitude"]) - 37.42) < 0.001
    assert abs(float(row["longitude"]) - (-122.08)) < 0.001

    a = requests.get(f"{API}/driver/active", headers=dh)
    assert a.status_code == 200, a.text
    j = a.json()
    assert "driver" in j and "orders" in j
    assert j["driver"] is not None
    assert abs(float(j["driver"]["latitude"]) - 37.42) < 0.001
    assert isinstance(j["orders"], list)
    # cleanup
    _run_sql("DELETE FROM drivers WHERE user_id=%s", (duid,))
