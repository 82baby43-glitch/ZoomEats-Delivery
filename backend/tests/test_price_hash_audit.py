"""Audit trail tests — tamper-evident orders.price_hash.

Every order created via POST /api/orders gets a sha256 snapshot of the canonical
(repriced) cart items. The admin verify-receipt endpoint re-hashes the stored
items JSONB and compares to the column — exposing post-hoc tampering of the row.
"""
import json
import uuid

import pytest
import requests

from backend_test import make_user, API, _conn, _run_sql  # noqa: E402


@pytest.fixture(scope="module")
def admin():
    uid, tok, h = make_user("admin")
    return {"uid": uid, "token": tok, "h": h}


def _create_order(h):
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    item = menu[0]
    r = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": item["item_id"], "name": "x", "price": 0.01,
                   "quantity": 2, "image_url": ""}],
        "address": "1 Audit St", "notes": "",
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_price_hash_set_on_create():
    """Every new order gets a 64-char sha256 in orders.price_hash + exposed in API."""
    _, _, h = make_user("customer")
    o = _create_order(h)
    assert o.get("price_hash"), "price_hash missing from response"
    assert len(o["price_hash"]) == 64
    assert all(c in "0123456789abcdef" for c in o["price_hash"])


def test_verify_receipt_matches_on_untouched_order(admin):
    """Fresh order → admin verify endpoint reports match=True."""
    _, _, h = make_user("customer")
    o = _create_order(h)
    r = requests.get(f"{API}/admin/orders/{o['order_id']}/verify-receipt",
                     headers=admin["h"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["match"] is True
    assert body["stored_hash"] == o["price_hash"]
    assert body["recomputed_hash"] == o["price_hash"]


def test_verify_receipt_detects_tampering(admin):
    """If someone edits orders.items directly in Postgres, recomputed hash diverges
    from the stored one → match=False. This is the audit-trail guarantee."""
    _, _, h = make_user("customer")
    o = _create_order(h)
    # Tamper with the stored items — bump price on the first line to $0.01
    with _conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT items FROM orders WHERE order_id=%s", (o["order_id"],))
            items = cur.fetchone()[0]
            items[0]["price"] = 0.01
            cur.execute("UPDATE orders SET items=%s WHERE order_id=%s",
                        (json.dumps(items), o["order_id"]))
        c.commit()
    r = requests.get(f"{API}/admin/orders/{o['order_id']}/verify-receipt",
                     headers=admin["h"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["match"] is False, "Tampered order passed verification!"
    assert body["stored_hash"] != body["recomputed_hash"]


def test_verify_receipt_handles_legacy_null_hash(admin):
    """Orders created before the price_hash column existed → match=None,
    not a false-positive failure."""
    _, _, h = make_user("customer")
    o = _create_order(h)
    # Simulate a legacy row by NULLing the hash
    _run_sql("UPDATE orders SET price_hash=NULL WHERE order_id=%s", (o["order_id"],))
    r = requests.get(f"{API}/admin/orders/{o['order_id']}/verify-receipt",
                     headers=admin["h"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["match"] is None
    assert body["stored_hash"] is None
    assert "pre-dates" in body.get("note", "").lower()


def test_verify_receipt_requires_admin():
    """A normal customer cannot verify receipts — 403."""
    _, _, h_admin = make_user("admin")
    _, _, h_cust = make_user("customer")
    o = _create_order(h_cust)
    r = requests.get(f"{API}/admin/orders/{o['order_id']}/verify-receipt",
                     headers=h_cust)
    assert r.status_code == 403, r.text


def test_verify_receipt_404_on_missing_order(admin):
    fake_oid = f"ord_fake_{uuid.uuid4().hex[:6]}"
    r = requests.get(f"{API}/admin/orders/{fake_oid}/verify-receipt",
                     headers=admin["h"])
    assert r.status_code == 404


def test_hash_is_deterministic_independent_of_item_order():
    """Same items in different order → same hash (because compute_price_hash sorts
    by item_id internally). This means a multi-item cart's hash is stable even if
    the frontend reorders the lines."""
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from server import compute_price_hash  # noqa: E402

    a = [{"item_id": "item_a", "name": "A", "price": 10.0, "quantity": 1},
         {"item_id": "item_b", "name": "B", "price": 5.0, "quantity": 2}]
    b = [a[1], a[0]]  # swapped
    assert compute_price_hash(a) == compute_price_hash(b)
