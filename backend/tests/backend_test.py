"""ZoomEats backend integration tests."""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://builder-hub-470.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mc = MongoClient(MONGO_URL)
db = mc[DB_NAME]


def make_user(role="customer", email=None):
    uid = f"test-user-{uuid.uuid4().hex[:8]}"
    token = f"test_session_{uuid.uuid4().hex}"
    db.users.insert_one({
        "user_id": uid,
        "email": email or f"TEST_{uid}@example.com",
        "name": f"Test {role}",
        "picture": "",
        "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": uid,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return uid, token, {"Authorization": f"Bearer {token}"}


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
    assert r.json().get("status") == "ok"

def test_list_restaurants_seeded():
    r = requests.get(f"{API}/restaurants")
    assert r.status_code == 200
    rests = r.json()
    names = {x["name"] for x in rests}
    assert {"Terra Verde", "Hachi Roll Co.", "Ember & Oak"}.issubset(names)

def test_search_sushi():
    r = requests.get(f"{API}/restaurants", params={"q": "sushi"})
    assert r.status_code == 200
    data = r.json()
    # Hachi Roll Co. description mentions sushi
    assert any("Hachi" in x["name"] for x in data)

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

def test_role_switch_to_vendor_then_back(cust):
    # create a fresh customer to flip
    uid, tok, h = make_user("customer")
    r = requests.post(f"{API}/auth/role", headers=h, json={"role": "vendor"})
    assert r.status_code == 200
    assert r.json()["role"] == "vendor"
    # Invalid role
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
    o = r.json()
    return o

def test_order_created_correctly(order):
    assert order["status"] == "pending_payment"
    assert order["payment_status"] == "pending"
    assert order["delivery_fee"] == 2.99
    expected_subtotal = round(order["items"][0]["price"] * order["items"][0]["quantity"], 2)
    assert order["subtotal"] == expected_subtotal
    assert order["total"] == round(expected_subtotal + 2.99, 2)

def test_orders_my(cust, order):
    r = requests.get(f"{API}/orders/my", headers=cust["h"])
    assert r.status_code == 200
    assert any(o["order_id"] == order["order_id"] for o in r.json())

def test_get_order_as_customer(cust, order):
    r = requests.get(f"{API}/orders/{order['order_id']}", headers=cust["h"])
    assert r.status_code == 200
    assert r.json()["order_id"] == order["order_id"]

def test_orders_unauth():
    r = requests.post(f"{API}/orders", json={"restaurant_id":"x","items":[],"address":"a"})
    assert r.status_code == 401


# -------- Stripe checkout --------
def test_checkout_session(cust, order):
    r = requests.post(f"{API}/checkout/session", headers=cust["h"],
                      json={"order_id": order["order_id"], "origin_url": BASE_URL})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "url" in data and "session_id" in data
    sid = data["session_id"]
    tx = db.payment_transactions.find_one({"session_id": sid})
    assert tx is not None
    assert tx["payment_status"] == "initiated"
    # status endpoint
    s = requests.get(f"{API}/checkout/status/{sid}", headers=cust["h"])
    assert s.status_code == 200
    assert "payment_status" in s.json()


# -------- Vendor flow --------
def test_vendor_flow(vendor):
    # create restaurant
    r = requests.post(f"{API}/vendor/restaurant", headers=vendor["h"],
                      json={"name": "TEST_Vendor Resto", "cuisine": "Test", "description": "d"})
    assert r.status_code == 200
    rest = r.json()
    assert rest["name"] == "TEST_Vendor Resto"
    # get
    g = requests.get(f"{API}/vendor/restaurant", headers=vendor["h"])
    assert g.status_code == 200 and g.json()["restaurant_id"] == rest["restaurant_id"]
    # add menu
    m = requests.post(f"{API}/vendor/menu-items", headers=vendor["h"],
                      json={"name": "TEST_Item", "price": 9.99})
    assert m.status_code == 200
    item = m.json()
    # list
    lst = requests.get(f"{API}/vendor/menu-items", headers=vendor["h"])
    assert lst.status_code == 200 and any(x["item_id"] == item["item_id"] for x in lst.json())
    # delete
    d = requests.delete(f"{API}/vendor/menu-items/{item['item_id']}", headers=vendor["h"])
    assert d.status_code == 200
    # vendor orders
    vo = requests.get(f"{API}/vendor/orders", headers=vendor["h"])
    assert vo.status_code == 200 and isinstance(vo.json(), list)


# -------- Delivery flow --------
def test_delivery_flow(delivery, cust):
    # create order ready for delivery
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    it = menu[0]
    o = requests.post(f"{API}/orders", headers=cust["h"], json={
        "restaurant_id": rid,
        "items": [{"item_id": it["item_id"], "name": it["name"], "price": it["price"], "quantity": 1, "image_url": ""}],
        "address": "x",
    }).json()
    db.orders.update_one({"order_id": o["order_id"]},
                         {"$set": {"status": "ready", "payment_status": "paid"}})
    # available
    av = requests.get(f"{API}/delivery/available", headers=delivery["h"])
    assert av.status_code == 200
    assert any(x["order_id"] == o["order_id"] for x in av.json())
    # accept
    ac = requests.post(f"{API}/delivery/orders/{o['order_id']}/accept", headers=delivery["h"])
    assert ac.status_code == 200
    # deliver
    dv = requests.post(f"{API}/delivery/orders/{o['order_id']}/deliver", headers=delivery["h"])
    assert dv.status_code == 200
    final = db.orders.find_one({"order_id": o["order_id"]})
    assert final["status"] == "delivered"


# -------- Admin --------
def test_admin_endpoints(admin):
    for path in ["/admin/metrics", "/admin/users", "/admin/restaurants", "/admin/orders"]:
        r = requests.get(f"{API}{path}", headers=admin["h"])
        assert r.status_code == 200, f"{path} -> {r.status_code}"
    # approve
    rid = requests.get(f"{API}/restaurants").json()[0]["restaurant_id"]
    r = requests.post(f"{API}/admin/restaurants/{rid}/approve", headers=admin["h"])
    assert r.status_code == 200


# -------- Role guards --------
def test_role_guards(cust):
    for path in ["/vendor/restaurant", "/delivery/available", "/admin/metrics"]:
        r = requests.get(f"{API}{path}", headers=cust["h"])
        assert r.status_code == 403, f"{path} -> {r.status_code}"


# -------- AI Chat --------
def test_chat_and_history(cust):
    r = requests.post(f"{API}/chat", headers=cust["h"],
                      json={"text": "Suggest something light and Mediterranean."})
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("reply"), str) and len(data["reply"]) > 0
    time.sleep(1)
    h = requests.get(f"{API}/chat/history", headers=cust["h"])
    assert h.status_code == 200
    msgs = h.json()
    assert len(msgs) >= 2
    assert any(m["role"] == "assistant" for m in msgs)
