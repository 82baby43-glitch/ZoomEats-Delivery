"""Security tests: server-side menu re-pricing in POST /api/orders.

Vulnerability fixed: previously the backend trusted client-supplied `price` for
every cart line, so a malicious user could edit prices in DevTools / localStorage
and pay $0.01 for a $50 order. Now the server looks up the canonical price from
`menu_items` and ignores whatever the client sent.
"""
import os
import uuid
from pathlib import Path

import requests
import psycopg2
from dotenv import load_dotenv

# Reuse the make_user helper + connection pattern from backend_test.py
from backend_test import make_user, BASE_URL, API, _conn  # noqa: E402

load_dotenv(Path("/app/backend/.env"))
DATABASE_URL = os.environ["DATABASE_URL"]


def _menu_item():
    """Pick a known seed item (first restaurant, first menu item) and return
    (rid, item_id, canonical_price, canonical_name)."""
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    m = menu[0]
    return rid, m["item_id"], float(m["price"]), m["name"]


# --------------------------------------------------------------------------
def test_repricing_ignores_tampered_price():
    """Client sends price=$0.01 for a $19 item → server must reject the tampered
    price and store the canonical one. Subtotal = canonical * qty (NOT 0.01 * qty).
    """
    _, _, h = make_user("customer")
    rid, item_id, canonical_price, _ = _menu_item()
    qty = 2

    r = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": item_id, "name": "tampered", "price": 0.01,
                   "quantity": qty, "image_url": "x"}],
        "address": "1 Security St", "notes": "",
    })
    assert r.status_code == 200, r.text
    o = r.json()

    expected_subtotal = round(canonical_price * qty, 2)
    expected_total = round(expected_subtotal + 2.99, 2)
    assert o["subtotal"] == expected_subtotal, f"server kept tampered price! got {o['subtotal']}, expected {expected_subtotal}"
    assert o["total"] == expected_total
    assert o["items"][0]["price"] == canonical_price


def test_repricing_overwrites_tampered_name_and_image():
    """Client sends a fake name/image_url → server overwrites with canonical."""
    _, _, h = make_user("customer")
    rid, item_id, _, canonical_name = _menu_item()
    r = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": item_id, "name": "FREE PIZZA", "price": 999,
                   "quantity": 1, "image_url": "https://evil.example.com/x.jpg"}],
        "address": "1 Security St", "notes": "",
    })
    assert r.status_code == 200, r.text
    item = r.json()["items"][0]
    assert item["name"] == canonical_name
    assert "evil.example.com" not in (item["image_url"] or "")


def test_rejects_item_from_wrong_restaurant():
    """Client tries to add restaurant A's $1 item to an order at restaurant B
    (which has a $20 menu). Server must 400 — the item doesn't belong to B."""
    _, _, h = make_user("customer")
    rests = requests.get(f"{API}/restaurants").json()
    assert len(rests) >= 2
    rid_a = rests[0]["restaurant_id"]
    rid_b = rests[1]["restaurant_id"]
    menu_a = requests.get(f"{API}/restaurants/{rid_a}").json()["menu"]
    cross_item = menu_a[0]

    r = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid_b,  # ordering at B
        "items": [{"item_id": cross_item["item_id"],  # ...but item is from A
                   "name": cross_item["name"], "price": cross_item["price"],
                   "quantity": 1, "image_url": ""}],
        "address": "1 Security St", "notes": "",
    })
    assert r.status_code == 400, r.text
    assert "unavailable" in r.text.lower() or cross_item["item_id"] in r.text


def test_rejects_nonexistent_item():
    """Client sends a fabricated item_id → 400."""
    _, _, h = make_user("customer")
    rid, _, _, _ = _menu_item()
    fake_id = f"item_fake_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": fake_id, "name": "fake", "price": 1,
                   "quantity": 1, "image_url": ""}],
        "address": "1 Security St", "notes": "",
    })
    assert r.status_code == 400, r.text
    assert fake_id in r.text or "unavailable" in r.text.lower()


def test_rejects_unavailable_item():
    """Item exists but is flipped to available=false → 400."""
    _, _, h = make_user("customer")
    rid, item_id, _, _ = _menu_item()
    # Flip availability OFF directly via DB
    with _conn() as c:
        with c.cursor() as cur:
            cur.execute("UPDATE menu_items SET available=false WHERE item_id=%s", (item_id,))
        c.commit()
    try:
        r = requests.post(f"{API}/orders", headers=h, json={
            "restaurant_id": rid,
            "items": [{"item_id": item_id, "name": "x", "price": 1,
                       "quantity": 1, "image_url": ""}],
            "address": "1 Security St", "notes": "",
        })
        assert r.status_code == 400, r.text
    finally:
        # Restore so other tests don't see a broken seed
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute("UPDATE menu_items SET available=true WHERE item_id=%s", (item_id,))
            c.commit()


def test_quantity_clamping():
    """Excessive quantity (e.g. 9999) should be clamped to 99. Negative qty → 1."""
    _, _, h = make_user("customer")
    rid, item_id, canonical_price, _ = _menu_item()

    # Excessive qty
    r = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": item_id, "name": "", "price": 0,
                   "quantity": 9999, "image_url": ""}],
        "address": "1 Security St", "notes": "",
    })
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["items"][0]["quantity"] == 99
    assert o["subtotal"] == round(canonical_price * 99, 2)

    # Zero / negative qty → clamped to 1
    r2 = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": item_id, "name": "", "price": 0,
                   "quantity": 0, "image_url": ""}],
        "address": "1 Security St", "notes": "",
    })
    assert r2.status_code == 200, r2.text
    assert r2.json()["items"][0]["quantity"] == 1


def test_multi_item_subtotal_is_canonical():
    """All items in a multi-line cart are repriced from canonical menu_items."""
    _, _, h = make_user("customer")
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    assert len(menu) >= 2
    items = menu[:2]
    payload_items = [
        {"item_id": items[0]["item_id"], "name": "x", "price": 0.01,
         "quantity": 3, "image_url": ""},
        {"item_id": items[1]["item_id"], "name": "y", "price": 0.01,
         "quantity": 2, "image_url": ""},
    ]
    r = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid, "items": payload_items,
        "address": "1 Security St", "notes": "",
    })
    assert r.status_code == 200, r.text
    o = r.json()
    expected = round(items[0]["price"] * 3 + items[1]["price"] * 2, 2)
    assert o["subtotal"] == expected, f"expected {expected}, got {o['subtotal']}"
