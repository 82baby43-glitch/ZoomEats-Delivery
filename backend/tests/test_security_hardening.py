"""Security audit follow-up tests — covers fixes for SEC-001, SEC-002, SEC-003, SEC-004 + P3 hardening."""
import time

import pytest
import requests

from backend_test import make_user, API, BASE_URL


# ---------- SEC-001: Stripe webhook signature enforcement ----------
def test_webhook_rejects_unsigned_event():
    """Forged unsigned webhook → HTTP 503 (no STRIPE_WEBHOOK_SECRET) or 400 (sig missing)."""
    r = requests.post(f"{API}/webhook/stripe", json={
        "type": "checkout.session.completed",
        "data": {"object": {"payment_status": "paid"}},
        "metadata": {"order_id": "ord_attacker"},
    })
    assert r.status_code in (400, 503), r.text
    assert r.json().get("received") is not True


def test_webhook_no_longer_returns_received_on_failure():
    """The old code returned {received: true} for everything; verify that's fixed."""
    r = requests.post(f"{API}/webhook/stripe", data="bogus", headers={"Stripe-Signature": "t=0,v1=bad"})
    # Either 503 (no secret configured) or 400 (signature verify fail) — never 200 received:true
    assert r.status_code != 200 or r.json().get("received") is not True


# ---------- SEC-P3: Open-redirect on /checkout/session ----------
def test_checkout_session_rejects_untrusted_origin_url():
    """origin_url=evil.example.com → 400 (host not in trusted allowlist)."""
    _, _, h = make_user("customer")
    # Need a real order to get past the order-ownership check
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    o = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": menu[0]["item_id"], "name": "", "price": 0, "quantity": 1, "image_url": ""}],
        "address": "1 Test St", "notes": "",
    }).json()
    r = requests.post(f"{API}/checkout/session", headers=h, json={
        "order_id": o["order_id"],
        "origin_url": "https://evil.example.com",
    })
    assert r.status_code == 400, r.text
    assert "trusted allowlist" in r.text.lower() or "host" in r.text.lower()


def test_checkout_session_rejects_non_https():
    _, _, h = make_user("customer")
    r = requests.post(f"{API}/checkout/session", headers=h, json={
        "order_id": "ord_anything",
        "origin_url": "http://attacker.local",
    })
    assert r.status_code == 400, r.text


# ---------- SEC-003: Restaurant moderation — new vendor restaurants default to unapproved ----------
def test_new_vendor_restaurant_is_unapproved_by_default():
    """A freshly-created vendor restaurant must NOT appear in public /api/restaurants
    until an admin approves it."""
    _, _, h = make_user("vendor")
    r = requests.post(f"{API}/vendor/restaurant", headers=h, json={
        "name": "TEST_unapproved_kitchen_xyz",
        "cuisine": "Test", "description": "should not appear publicly",
        "address": "",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["restaurant_id"]
    assert r.json()["approved"] is False, "new restaurant should default to approved=False"

    # Public listing must NOT include it
    public = requests.get(f"{API}/restaurants").json()
    assert all(x["restaurant_id"] != rid for x in public), "unapproved restaurant leaked to public list"


def test_admin_can_approve_pending_restaurant():
    """Admin flipping approved=True via /api/admin/restaurants/{rid}/approve makes it public."""
    _, _, vendor_h = make_user("vendor")
    _, _, admin_h = make_user("admin")
    rid = requests.post(f"{API}/vendor/restaurant", headers=vendor_h, json={
        "name": "TEST_approve_flow_xyz", "cuisine": "Test", "description": "", "address": "",
    }).json()["restaurant_id"]

    # Approve via admin endpoint
    r = requests.post(f"{API}/admin/restaurants/{rid}/approve", headers=admin_h)
    assert r.status_code == 200, r.text

    # Now in public listing
    public = requests.get(f"{API}/restaurants").json()
    assert any(x["restaurant_id"] == rid for x in public)


# ---------- SEC-004: Rate limiting ----------
def test_chat_rate_limit_kicks_in():
    """After bursting through the chat token bucket, further calls return 429."""
    _, _, h = make_user("customer")
    # Burst: 20 tokens cap. After ~25 quick requests we should see at least one 429.
    statuses = []
    for _ in range(30):
        r = requests.post(f"{API}/chat", headers=h, json={"text": "hi"}, timeout=15)
        statuses.append(r.status_code)
        if r.status_code == 429:
            break
    assert 429 in statuses, f"never got 429; saw: {statuses}"
    # Verify the 429 response carries a Retry-After header
    r2 = requests.post(f"{API}/chat", headers=h, json={"text": "hi"})
    if r2.status_code == 429:
        assert "retry-after" in {k.lower() for k in r2.headers.keys()}


def test_tracking_rate_limit_caps_polling():
    """30 tracking polls / minute / user — burst over 30 should 429."""
    _, _, h = make_user("customer")
    # Make a quick order
    rests = requests.get(f"{API}/restaurants").json()
    rid = rests[0]["restaurant_id"]
    menu = requests.get(f"{API}/restaurants/{rid}").json()["menu"]
    o = requests.post(f"{API}/orders", headers=h, json={
        "restaurant_id": rid,
        "items": [{"item_id": menu[0]["item_id"], "name": "", "price": 0, "quantity": 1, "image_url": ""}],
        "address": "", "notes": "",
    }).json()
    statuses = []
    for _ in range(40):
        r = requests.get(f"{API}/orders/{o['order_id']}/tracking", headers=h, timeout=10)
        statuses.append(r.status_code)
        if r.status_code == 429:
            break
    assert 429 in statuses, f"never got 429; saw codes: {set(statuses)}"


# ---------- P3: Security headers ----------
def test_security_headers_present():
    r = requests.get(f"{API}/")
    headers = {k.lower(): v for k, v in r.headers.items()}
    assert "strict-transport-security" in headers
    assert "max-age" in headers["strict-transport-security"]
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert "strict-origin" in headers.get("referrer-policy", "")


# ---------- SEC-002: CORS — note that the preview ingress wildcards, so we test FastAPI directly ----------
def test_fastapi_cors_no_credentials_for_untrusted_origin():
    """FastAPI itself (not the ingress) should NOT echo Allow-Origin for evil origins.
    We hit localhost:8001 directly because the kube ingress strips/rewrites CORS headers
    before they reach the client in the preview environment."""
    r = requests.get("http://localhost:8001/api/", headers={"Origin": "https://evil.example.com"})
    # Either no Allow-Origin header (rejected) OR the header does not echo back the evil origin
    aco = r.headers.get("access-control-allow-origin", "").lower()
    assert aco != "https://evil.example.com", "FastAPI echoed an untrusted origin"
    assert aco != "*", "FastAPI returned wildcard with credentials enabled"
