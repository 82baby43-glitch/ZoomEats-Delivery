"""ZoomEats backend — Supabase Postgres edition."""
import os
import re
import uuid
import json
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from sqlalchemy import select, func, and_, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_db
from models import (
    User, UserSession, Restaurant, MenuItem, Order, PaymentTransaction, ChatMessage,
    Driver, Delivery, Wallet, WalletTransaction, WalletPayout,
)
from dispatch import dispatch_order as run_dispatch
from wallet import credit_pending_for_order, settle_pending_on_delivery, _get_or_create_wallet, request_payout  # noqa: E402
from agreements import router as agreements_router, admin_router as compliance_admin_router, has_required_acceptances  # noqa: E402
from audit_exporter import start_background_snapshot, stop_background_snapshot, create_and_upload_snapshot  # noqa: E402
from geocode import geocode_address
from rate_limit import TokenBucket

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")  # SEC-001: signature secret
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

# SEC-002: explicit CORS allowlist + optional regex (e.g. preview subdomains)
_RAW_CORS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
CORS_ORIGINS = [o for o in _RAW_CORS if o != "*"]
CORS_ORIGIN_REGEX = os.environ.get("CORS_ORIGIN_REGEX", "") or None
ALLOW_CREDENTIALS = bool(CORS_ORIGINS or CORS_ORIGIN_REGEX)

# Pre-compute the set of origin hosts we trust for `origin_url` (open-redirect guard)
def _origin_hosts() -> List[str]:
    hosts = set()
    for o in CORS_ORIGINS:
        try:
            hosts.add(urlparse(o).netloc.lower())
        except Exception:
            continue
    return [h for h in hosts if h]
TRUSTED_HOSTS = _origin_hosts()
TRUSTED_HOST_REGEX = re.compile(CORS_ORIGIN_REGEX) if CORS_ORIGIN_REGEX else None


def _validate_origin_url(url: str) -> None:
    """SEC-P3: Reject attacker-controlled origin_url values in /checkout/session."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(400, "Invalid origin_url")
    if parsed.scheme not in ("https",) or not parsed.netloc:
        raise HTTPException(400, "origin_url must be a https:// URL")
    host = parsed.netloc.lower()
    if host in TRUSTED_HOSTS:
        return
    if TRUSTED_HOST_REGEX and TRUSTED_HOST_REGEX.fullmatch(f"{parsed.scheme}://{host}"):
        return
    raise HTTPException(400, f"origin_url host '{host}' is not in the trusted allowlist")


# SEC-004: per-user rate limiters for cost-sensitive endpoints
chat_limiter = TokenBucket(max_tokens=20, refill_per_minute=4, name="chat")        # ~20 burst, 4/min sustained
tracking_limiter = TokenBucket(max_tokens=30, refill_per_minute=30, name="tracking")  # 30/min — matches polling cadence

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("zoomeats")

if not CORS_ORIGINS and not CORS_ORIGIN_REGEX:
    logger.warning("SEC-002: No CORS_ORIGINS configured — credentialed CORS is DISABLED.")
if not STRIPE_WEBHOOK_SECRET:
    logger.warning("SEC-001: STRIPE_WEBHOOK_SECRET not set — /api/webhook/stripe will reject all events (HTTP 503).")

app = FastAPI(title="ZoomEats API")
api = APIRouter(prefix="/api")


# Start background tasks on app startup/shutdown
@app.on_event("startup")
async def _start_tasks():
    try:
        start_background_snapshot()
    except Exception:
        logger.exception("Failed to start audit snapshot task")


@app.on_event("shutdown")
async def _stop_tasks():
    try:
        stop_background_snapshot()
    except Exception:
        logger.exception("Failed to stop audit snapshot task")


# SEC-P3: security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=()"
        # CSP intentionally pragmatic — Leaflet + Supabase Realtime + inline styles need flexibility.
        # Tightening to a strict policy is a follow-up after measuring violations in prod.
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        return response


# ---------- Pydantic request bodies ----------
class RoleUpdate(BaseModel):
    role: str


class RestaurantCreate(BaseModel):
    name: str
    description: str = ""
    cuisine: str = ""
    image_url: str = ""
    cover_url: str = ""
    address: str = ""


class MenuItemCreate(BaseModel):
    name: str
    description: str = ""
    price: float
    image_url: str = ""
    category: str = "Mains"


class CartLine(BaseModel):
    item_id: str
    name: str = ""        # ignored server-side; canonical name is looked up
    price: float = 0.0    # ignored server-side; canonical price is looked up
    quantity: int
    image_url: str = ""   # ignored server-side; canonical image is looked up


class OrderCreate(BaseModel):
    restaurant_id: str
    items: List[CartLine]
    address: str
    notes: str = ""


class ChatPayload(BaseModel):
    text: str
    session_id: Optional[str] = None


# ---------- Helpers ----------
def to_iso(dt: Optional[datetime]) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def user_dict(u: User) -> dict:
    return {
        "user_id": u.user_id, "email": u.email, "name": u.name,
        "picture": u.picture or "", "role": u.role, "created_at": to_iso(u.created_at),
    }


def rest_dict(r: Restaurant) -> dict:
    return {
        "restaurant_id": r.restaurant_id, "owner_id": r.owner_id, "name": r.name,
        "description": r.description or "", "cuisine": r.cuisine or "",
        "image_url": r.image_url or "", "cover_url": r.cover_url or "",
        "address": r.address or "", "rating": r.rating, "delivery_time_min": r.delivery_time_min,
        "approved": r.approved, "created_at": to_iso(r.created_at),
        "latitude": r.latitude, "longitude": r.longitude,
        "address_validated": r.address_validated,
    }


def item_dict(m: MenuItem) -> dict:
    return {
        "item_id": m.item_id, "restaurant_id": m.restaurant_id, "name": m.name,
        "description": m.description or "", "price": m.price, "image_url": m.image_url or "",
        "category": m.category, "available": m.available,
    }


def order_dict(o: Order) -> dict:
    return {
        "order_id": o.order_id, "customer_id": o.customer_id, "customer_name": o.customer_name,
        "restaurant_id": o.restaurant_id, "restaurant_name": o.restaurant_name,
        "items": o.items, "subtotal": o.subtotal, "delivery_fee": o.delivery_fee, "total": o.total,
        "address": o.address or "", "notes": o.notes or "",
        "status": o.status, "payment_status": o.payment_status,
        "delivery_partner_id": o.delivery_partner_id, "stripe_session_id": o.stripe_session_id,
        "price_hash": o.price_hash,
        "created_at": to_iso(o.created_at),
    }


def compute_price_hash(items: List[dict]) -> str:
    """Tamper-evident sha256 of canonical cart items. Field order is fixed and
    items are sorted by item_id so the hash is deterministic regardless of insert order.
    Includes the same fields the customer was billed on: item_id, name, price, quantity."""
    snapshot = [
        {"item_id": it["item_id"], "name": it["name"],
         "price": float(it["price"]), "quantity": int(it["quantity"])}
        for it in sorted(items, key=lambda x: x["item_id"])
    ]
    blob = json.dumps(snapshot, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


# ---------- Auth dependency ----------
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> User:
    token = session_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    res = await db.execute(select(UserSession).where(UserSession.session_token == token))
    sess = res.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires = sess.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = (await db.execute(select(User).where(User.user_id == sess.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: str):
    async def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {roles}")
        return user
    return dep


# ---------- Auth routes ----------
@api.post("/auth/session")
async def auth_session(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data["email"]
    name = data.get("name", email.split("@")[0])
    picture = data.get("picture", "")
    session_token = data["session_token"]

    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        existing.name = name
        existing.picture = picture
        if email.lower() in ADMIN_EMAILS and existing.role != "admin":
            existing.role = "admin"
        user = existing
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        role = "admin" if email.lower() in ADMIN_EMAILS else "customer"
        user = User(user_id=user_id, email=email, name=name, picture=picture, role=role)
        db.add(user)

    sess = UserSession(
        session_token=session_token,
        user_id=user.user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(sess)
    await db.commit()
    await db.refresh(user)

    response.set_cookie(
        key="session_token", value=session_token, httponly=True, secure=True,
        samesite="none", max_age=7 * 24 * 60 * 60, path="/",
    )
    return {"user": user_dict(user)}


@api.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user_dict(user)


@api.post("/auth/logout")
async def auth_logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    session_token: Optional[str] = Cookie(default=None),
):
    if session_token:
        await db.execute(UserSession.__table__.delete().where(UserSession.session_token == session_token))
        await db.commit()
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


@api.post("/auth/role")
async def auth_set_role(
    payload: RoleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.role not in {"customer", "vendor", "delivery"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Admin role cannot be changed")
    user.role = payload.role
    await db.commit()
    await db.refresh(user)
    return user_dict(user)


# ---------- Restaurants ----------
@api.get("/restaurants")
async def list_restaurants(q: Optional[str] = None, cuisine: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    stmt = select(Restaurant).where(Restaurant.approved.is_(True))
    if cuisine:
        stmt = stmt.where(Restaurant.cuisine == cuisine)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Restaurant.name.ilike(like), Restaurant.description.ilike(like), Restaurant.cuisine.ilike(like)))
    stmt = stmt.order_by(desc(Restaurant.rating))
    res = await db.execute(stmt)
    return [rest_dict(r) for r in res.scalars().all()]


@api.get("/restaurants/{rid}")
async def get_restaurant(rid: str, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Restaurant).where(Restaurant.restaurant_id == rid))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Not found")
    items_res = await db.execute(
        select(MenuItem).where(MenuItem.restaurant_id == rid, MenuItem.available.is_(True))
    )
    return {"restaurant": rest_dict(r), "menu": [item_dict(m) for m in items_res.scalars().all()]}


# ---------- Vendor ----------
@api.get("/vendor/restaurant")
async def vendor_get_restaurant(user: User = Depends(require_role("vendor")), db: AsyncSession = Depends(get_db)):
    r = (await db.execute(
        select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1)
    )).scalars().first()
    return rest_dict(r) if r else None


@api.post("/vendor/restaurant")
async def vendor_create_or_update(
    payload: RestaurantCreate,
    user: User = Depends(require_role("vendor")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1)
    )).scalars().first()
    # Geocode the address if provided
    coords = await geocode_address(payload.address) if payload.address else None
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        if coords:
            existing.latitude, existing.longitude = coords
            existing.address_validated = True
        else:
            existing.address_validated = False
        await db.commit()
        await db.refresh(existing)
        return rest_dict(existing)
    # Enforce required agreement acceptances before allowing restaurant activation
    try:
        ok = await has_required_acceptances(db, user.user_id, "vendor")
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(403, "Restaurant activation requires accepting all required agreements via the Agreement Center")

    r = Restaurant(
        restaurant_id=f"rest_{uuid.uuid4().hex[:10]}",
        owner_id=user.user_id,
        latitude=coords[0] if coords else None,
        longitude=coords[1] if coords else None,
        address_validated=bool(coords),
        **payload.model_dump(),
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return rest_dict(r)


@api.get("/vendor/menu-items")
async def vendor_list_menu(user: User = Depends(require_role("vendor")), db: AsyncSession = Depends(get_db)):
    rest = (await db.execute(
        select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1)
    )).scalars().first()
    if not rest:
        return []
    res = await db.execute(select(MenuItem).where(MenuItem.restaurant_id == rest.restaurant_id))
    return [item_dict(m) for m in res.scalars().all()]


@api.post("/vendor/menu-items")
async def vendor_add_menu(
    payload: MenuItemCreate,
    user: User = Depends(require_role("vendor")),
    db: AsyncSession = Depends(get_db),
):
    rest = (await db.execute(
        select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1)
    )).scalars().first()
    if not rest:
        raise HTTPException(400, "Create restaurant first")
    m = MenuItem(item_id=f"item_{uuid.uuid4().hex[:10]}", restaurant_id=rest.restaurant_id, **payload.model_dump())
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return item_dict(m)


@api.delete("/vendor/menu-items/{item_id}")
async def vendor_del_menu(item_id: str, user: User = Depends(require_role("vendor")), db: AsyncSession = Depends(get_db)):
    rest = (await db.execute(select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1))).scalars().first()
    if not rest:
        raise HTTPException(404, "No restaurant")
    await db.execute(
        MenuItem.__table__.delete().where(
            and_(MenuItem.item_id == item_id, MenuItem.restaurant_id == rest.restaurant_id)
        )
    )
    await db.commit()
    return {"ok": True}


@api.get("/vendor/orders")
async def vendor_orders(user: User = Depends(require_role("vendor")), db: AsyncSession = Depends(get_db)):
    rest = (await db.execute(select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1))).scalars().first()
    if not rest:
        return []
    res = await db.execute(
        select(Order).where(Order.restaurant_id == rest.restaurant_id).order_by(desc(Order.created_at))
    )
    return [order_dict(o) for o in res.scalars().all()]


@api.post("/vendor/orders/{oid}/status")
async def vendor_update_status(
    oid: str,
    body: Dict[str, Any],
    user: User = Depends(require_role("vendor")),
    db: AsyncSession = Depends(get_db),
):
    new_status = body.get("status")
    if new_status not in {"accepted", "preparing", "ready"}:
        raise HTTPException(400, "Invalid status")
    rest = (await db.execute(select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1))).scalars().first()
    if not rest:
        raise HTTPException(404, "No restaurant")
    o = (await db.execute(
        select(Order).where(and_(Order.order_id == oid, Order.restaurant_id == rest.restaurant_id))
    )).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Order not found")
    o.status = new_status
    await db.commit()
    return {"ok": True}


# ---------- Orders (customer) ----------
@api.post("/orders")
async def create_order(
    payload: OrderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not payload.items:
        raise HTTPException(400, "Empty cart")
    rest = (await db.execute(select(Restaurant).where(Restaurant.restaurant_id == payload.restaurant_id))).scalar_one_or_none()
    if not rest:
        raise HTTPException(404, "Restaurant not found")

    # ---- Server-side re-pricing (security): never trust client-supplied prices. ----
    # Look up the canonical menu_item rows for every item_id in the cart and verify:
    #   (a) the item exists, (b) it belongs to the requested restaurant,
    #   (c) it is currently available. Reject the order if anything is off.
    requested_ids = [i.item_id for i in payload.items]
    rows = (await db.execute(
        select(MenuItem).where(and_(
            MenuItem.item_id.in_(requested_ids),
            MenuItem.restaurant_id == rest.restaurant_id,
            MenuItem.available.is_(True),
        ))
    )).scalars().all()
    canonical = {m.item_id: m for m in rows}
    missing = [iid for iid in requested_ids if iid not in canonical]
    if missing:
        raise HTTPException(400, f"Unavailable item(s): {', '.join(missing)}")

    # Rebuild the items list using canonical prices/names/images and clamped quantities.
    repriced_items: List[dict] = []
    subtotal = 0.0
    for line in payload.items:
        m = canonical[line.item_id]
        qty = max(1, min(int(line.quantity), 99))  # clamp to a sane positive range
        repriced_items.append({
            "item_id": m.item_id,
            "name": m.name,
            "price": float(m.price),
            "quantity": qty,
            "image_url": m.image_url or "",
        })
        subtotal += float(m.price) * qty
    subtotal = round(subtotal, 2)
    delivery_fee = 2.99
    total = round(subtotal + delivery_fee, 2)

    o = Order(
        order_id=f"ord_{uuid.uuid4().hex[:10]}",
        customer_id=user.user_id,
        customer_name=user.name,
        restaurant_id=rest.restaurant_id,
        restaurant_name=rest.name,
        items=repriced_items,
        subtotal=subtotal, delivery_fee=delivery_fee, total=total,
        address=payload.address, notes=payload.notes,
        status="pending_payment", payment_status="pending",
        price_hash=compute_price_hash(repriced_items),
    )
    db.add(o)
    await db.commit()
    await db.refresh(o)
    return order_dict(o)


@api.get("/orders/my")
async def my_orders(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Order).where(Order.customer_id == user.user_id).order_by(desc(Order.created_at))
    )
    return [order_dict(o) for o in res.scalars().all()]


@api.get("/orders/{oid}")
async def get_order(oid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    o = (await db.execute(select(Order).where(Order.order_id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    if user.role == "admin" or o.customer_id == user.user_id or o.delivery_partner_id == user.user_id:
        return order_dict(o)
    if o.restaurant_id:
        rest = (await db.execute(select(Restaurant).where(Restaurant.restaurant_id == o.restaurant_id))).scalar_one_or_none()
        if rest and rest.owner_id == user.user_id:
            return order_dict(o)
    raise HTTPException(403, "Forbidden")


# ---------- Delivery ----------
@api.get("/delivery/available")
async def delivery_available(user: User = Depends(require_role("delivery")), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Order).where(and_(Order.status == "ready", Order.delivery_partner_id.is_(None))).order_by(desc(Order.created_at))
    )
    return [order_dict(o) for o in res.scalars().all()]


@api.get("/delivery/my")
async def delivery_my(user: User = Depends(require_role("delivery")), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Order).where(Order.delivery_partner_id == user.user_id).order_by(desc(Order.created_at))
    )
    return [order_dict(o) for o in res.scalars().all()]


@api.post("/delivery/orders/{oid}/{action}")
async def delivery_action(
    oid: str, action: str,
    user: User = Depends(require_role("delivery")),
    db: AsyncSession = Depends(get_db),
):
    o = (await db.execute(select(Order).where(Order.order_id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    if action == "accept":
        if o.delivery_partner_id:
            raise HTTPException(400, "Already taken")
        o.delivery_partner_id = user.user_id
        o.status = "picked_up"
    elif action == "deliver":
        if o.delivery_partner_id != user.user_id:
            raise HTTPException(403, "Not your delivery")
        o.status = "delivered"
        # ---- Dispatch: decrement workload of the assigned internal driver (if any) ----
        if o.driver_id:
            drv = (await db.execute(select(Driver).where(Driver.driver_id == o.driver_id))).scalar_one_or_none()
            if drv:
                drv.workload = max(0, (drv.workload or 0) - 1)
        # Update the Delivery row status too
        dlv = (await db.execute(
            select(Delivery).where(Delivery.order_id == o.order_id).order_by(desc(Delivery.created_at))
        )).scalars().first()
        if dlv:
            dlv.status = "delivered"
            dlv.updated_at = datetime.now(timezone.utc)
        # Settle pending wallet credits for this order (move pending -> available)
        try:
            await settle_pending_on_delivery(db, o)
        except Exception as e:
            logger.warning(f"[wallet] settle_pending failed for {o.order_id}: {e}")
    else:
        raise HTTPException(400, "Bad action")
    await db.commit()
    return {"ok": True}


# ---------- Wallet APIs ----------
@api.get("/wallet/balance")
async def wallet_balance(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    w = (await db.execute(select(Wallet).where(Wallet.owner_user_id == user.user_id))).scalar_one_or_none()
    if not w:
        return {"available": 0.0, "pending": 0.0}
    return {"available": float(w.available or 0.0), "pending": float(w.pending or 0.0)}


@api.get("/wallet/transactions")
async def wallet_transactions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    w = (await db.execute(select(Wallet).where(Wallet.owner_user_id == user.user_id))).scalar_one_or_none()
    if not w:
        return []
    res = await db.execute(select(WalletTransaction).where(WalletTransaction.wallet_id == w.wallet_id).order_by(desc(WalletTransaction.created_at)).limit(200))
    return [dict(tx_id=t.tx_id, amount=float(t.amount), type=t.type, status=t.status, order_id=t.order_id, created_at=t.created_at.isoformat()) for t in res.scalars().all()]


class PayoutRequest(BaseModel):
    amount: float


@api.post("/wallet/payout")
async def wallet_payout(req: PayoutRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Determine wallet and connected account id
    w = (await db.execute(select(Wallet).where(Wallet.owner_user_id == user.user_id))).scalar_one_or_none()
    if not w:
        raise HTTPException(400, "No wallet found")
    connected_account = None
    if user.role == "delivery":
        drv = (await db.execute(select(Driver).where(Driver.user_id == user.user_id))).scalar_one_or_none()
        if drv:
            connected_account = drv.stripe_account_id
    elif user.role == "vendor":
        rest = (await db.execute(select(Restaurant).where(Restaurant.owner_id == user.user_id).order_by(desc(Restaurant.created_at)).limit(1))).scalars().first()
        if rest:
            connected_account = rest.stripe_account_id
    # attempt payout
    try:
        payout = await request_payout(db, w, float(req.amount), connected_account)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.warning(f"[wallet] payout request failed: {e}")
        raise HTTPException(500, "payout failed")
    return {"payout_id": payout.payout_id, "status": payout.status}


# ---------- Dispatch / driver tracking (additive) ----------
class DriverLocation(BaseModel):
    latitude: float
    longitude: float


async def _get_or_create_driver_row(db: AsyncSession, user: User) -> Driver:
    d = (await db.execute(select(Driver).where(Driver.user_id == user.user_id))).scalar_one_or_none()
    if d:
        return d
    # Enforce required agreement acceptances before provisioning driver activation
    try:
        ok = await has_required_acceptances(db, user.user_id, "delivery")
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(403, "Driver activation requires accepting all required agreements via the Agreement Center")
    d = Driver(driver_id=f"drv_{uuid.uuid4().hex[:10]}", user_id=user.user_id, availability=True, workload=0)
    db.add(d)
    await db.flush()
    return d


@api.post("/driver/location")
async def driver_location(
    payload: DriverLocation,
    user: User = Depends(require_role("delivery")),
    db: AsyncSession = Depends(get_db),
):
    """Driver heartbeat — call every 5-10s with current GPS. Updates last_seen + coords.
    Supabase Realtime broadcasts the row change automatically to subscribed clients."""
    d = await _get_or_create_driver_row(db, user)
    d.latitude = payload.latitude
    d.longitude = payload.longitude
    d.last_seen = datetime.now(timezone.utc)
    d.availability = True
    await db.commit()
    return {"ok": True, "driver_id": d.driver_id, "last_seen": d.last_seen.isoformat()}


@api.post("/driver/availability")
async def driver_availability(
    body: Dict[str, Any],
    user: User = Depends(require_role("delivery")),
    db: AsyncSession = Depends(get_db),
):
    """Toggle online/offline. {available: true|false}"""
    d = await _get_or_create_driver_row(db, user)
    d.availability = bool(body.get("available", True))
    d.last_seen = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "available": d.availability}


@api.get("/driver/active")
async def driver_active(
    user: User = Depends(require_role("delivery")),
    db: AsyncSession = Depends(get_db),
):
    """Driver's current active dispatch (assigned_internal/picked_up)."""
    d = (await db.execute(select(Driver).where(Driver.user_id == user.user_id))).scalar_one_or_none()
    if not d:
        return {"driver": None, "orders": []}
    rows = (await db.execute(
        select(Order).where(and_(
            Order.driver_id == d.driver_id,
            Order.status.in_(["assigned_internal", "picked_up"]),
        )).order_by(desc(Order.created_at))
    )).scalars().all()
    return {
        "driver": {
            "driver_id": d.driver_id, "availability": d.availability,
            "latitude": d.latitude, "longitude": d.longitude,
            "workload": d.workload,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        },
        "orders": [order_dict(o) for o in rows],
    }


@api.get("/orders/{oid}/tracking")
async def order_tracking(oid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Display-only tracking payload: order + delivery row + driver coords if internal."""
    # SEC-004: throttle per-user — tracking is polled aggressively from the frontend.
    tracking_limiter.check_or_raise(user.user_id)
    o = (await db.execute(select(Order).where(Order.order_id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    allowed = (user.role == "admin"
               or o.customer_id == user.user_id
               or o.delivery_partner_id == user.user_id)
    if not allowed and o.restaurant_id:
        rest = (await db.execute(select(Restaurant).where(Restaurant.restaurant_id == o.restaurant_id))).scalar_one_or_none()
        if rest and rest.owner_id == user.user_id:
            allowed = True
    if not allowed:
        d = (await db.execute(select(Driver).where(Driver.user_id == user.user_id))).scalar_one_or_none()
        if d and d.driver_id == o.driver_id:
            allowed = True
    if not allowed:
        raise HTTPException(403, "Forbidden")
    delivery = (await db.execute(
        select(Delivery).where(Delivery.order_id == oid).order_by(desc(Delivery.created_at))
    )).scalars().first()
    driver_payload = None
    if o.driver_id:
        drv = (await db.execute(select(Driver).where(Driver.driver_id == o.driver_id))).scalar_one_or_none()
        if drv:
            driver_payload = {
                "driver_id": drv.driver_id,
                "latitude": drv.latitude, "longitude": drv.longitude,
                "last_seen": drv.last_seen.isoformat() if drv.last_seen else None,
            }
    rest_payload = None
    if o.restaurant_id:
        rest = (await db.execute(select(Restaurant).where(Restaurant.restaurant_id == o.restaurant_id))).scalar_one_or_none()
        if rest:
            rest_payload = {
                "name": rest.name,
                "latitude": rest.latitude, "longitude": rest.longitude,
                "address": rest.address,
            }
    # SEC-004 / Nominatim: cache the geocoded customer coords on the order row.
    # First lookup geocodes; subsequent polls reuse the cached values for free.
    cust_payload = None
    if o.address:
        if o.customer_lat is not None and o.customer_lng is not None:
            cust_payload = {"latitude": o.customer_lat, "longitude": o.customer_lng, "address": o.address}
        else:
            try:
                coords = await geocode_address(o.address)
            except Exception:
                coords = None
            if coords:
                o.customer_lat, o.customer_lng = coords
                await db.commit()
                cust_payload = {"latitude": coords[0], "longitude": coords[1], "address": o.address}
    return {
        "order": order_dict(o),
        "delivery_type": o.delivery_type,
        "tracking_id": o.tracking_id,
        "driver": driver_payload,
        "restaurant": rest_payload,
        "customer": cust_payload,
        "delivery": ({
            "delivery_id": delivery.delivery_id, "provider": delivery.provider,
            "tracking_id": delivery.tracking_id,
            "eta": delivery.eta.isoformat() if delivery.eta else None,
            "status": delivery.status, "meta": delivery.meta,
        } if delivery else None),
    }


@api.post("/dispatch/trigger/{oid}")
async def dispatch_trigger(
    oid: str,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Admin/system endpoint — called by the Supabase Edge Function (or admin UI) to
    force-run the dispatch engine for a specific order. Idempotent."""
    return await run_dispatch(db, oid)


# ---------- Stripe Payments ----------
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest  # noqa: E402


@api.post("/checkout/session")
async def create_checkout(
    body: Dict[str, Any], request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    order_id = body.get("order_id")
    origin_url = body.get("origin_url")
    if not order_id or not origin_url:
        raise HTTPException(400, "order_id & origin_url required")
    # SEC-P3: validate origin_url against CORS allowlist to prevent open-redirect.
    _validate_origin_url(origin_url)
    o = (await db.execute(
        select(Order).where(and_(Order.order_id == order_id, Order.customer_id == user.user_id))
    )).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Order not found")
    if o.payment_status == "paid":
        raise HTTPException(400, "Already paid")

    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
    req = CheckoutSessionRequest(
        amount=float(o.total), currency="usd",
        success_url=f"{origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin_url}/cart",
        metadata={"order_id": order_id, "user_id": user.user_id},
    )
    session = await sc.create_checkout_session(req)

    db.add(PaymentTransaction(
        session_id=session.session_id, order_id=order_id, user_id=user.user_id,
        amount=float(o.total), currency="usd", payment_status="initiated",
        metadata_json={"order_id": order_id, "user_id": user.user_id},
    ))
    o.stripe_session_id = session.session_id
    await db.commit()
    return {"url": session.url, "session_id": session.session_id}


@api.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
    tx = (await db.execute(select(PaymentTransaction).where(PaymentTransaction.session_id == session_id))).scalar_one_or_none()
    status = None
    try:
        status = await sc.get_checkout_status(session_id)
    except Exception as e:
        logger.warning(f"Stripe status lookup failed for {session_id}: {e}")
        return {
            "status": "open",
            "payment_status": tx.payment_status if tx else "pending",
            "amount_total": int(round((tx.amount if tx else 0) * 100)),
            "currency": tx.currency if tx else "usd",
            "soft_error": True,
        }
    if tx and tx.payment_status != "paid" and status.payment_status == "paid":
        tx.payment_status = "paid"
        tx.status = status.status
        if tx.order_id:
            o = (await db.execute(select(Order).where(Order.order_id == tx.order_id))).scalar_one_or_none()
            if o:
                o.payment_status = "paid"
                o.status = "placed"
                # Credit pending wallet balances for this order (payments captured)
                try:
                    await credit_pending_for_order(db, o)
                except Exception as e:
                    logger.warning(f"[wallet] credit_pending failed for {tx.order_id}: {e}")
        await db.commit()
        # ---- Autonomous dispatch hook (additive) ----
        if tx.order_id:
            try:
                await run_dispatch(db, tx.order_id)
            except Exception as e:
                logger.warning(f"[dispatch] failed for order {tx.order_id}: {e}")
    return {"status": status.status, "payment_status": status.payment_status, "amount_total": status.amount_total, "currency": status.currency}


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # SEC-001 CRITICAL: reject every webhook unless a signing secret is configured AND
    # the request carries a valid Stripe-Signature header. Without this, an attacker can
    # POST a forged "paid" event for any order_id and fire dispatch at platform cost.
    if not STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook rejected: STRIPE_WEBHOOK_SECRET not configured.")
        raise HTTPException(503, "Webhook endpoint not configured")
    sig = request.headers.get("Stripe-Signature")
    if not sig:
        logger.warning("Stripe webhook rejected: missing Stripe-Signature header.")
        raise HTTPException(400, "Missing Stripe-Signature header")

    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(
        api_key=STRIPE_API_KEY,
        webhook_url=f"{host_url}/api/webhook/stripe",
        webhook_secret=STRIPE_WEBHOOK_SECRET,
    )
    body = await request.body()
    try:
        evt = await sc.handle_webhook(body, sig)
    except Exception as e:
        # Signature verification or parse failure → reject. Do NOT return 200 here.
        logger.warning(f"Stripe webhook signature verification failed: {e}")
        raise HTTPException(400, "Invalid webhook signature")
    if evt.payment_status == "paid" and evt.metadata.get("order_id"):
        o = (await db.execute(select(Order).where(Order.order_id == evt.metadata["order_id"]))).scalar_one_or_none()
        if o:
            o.payment_status = "paid"
            o.status = "placed"
        tx = (await db.execute(select(PaymentTransaction).where(PaymentTransaction.session_id == evt.session_id))).scalar_one_or_none()
        if tx:
            tx.payment_status = "paid"
        # Credit pending wallet balances for this order (payments captured via webhook)
        try:
            if o:
                await credit_pending_for_order(db, o)
        except Exception as e:
            logger.warning(f"[wallet] credit_pending failed for {evt.metadata.get('order_id')}: {e}")
        await db.commit()
        # ---- Autonomous dispatch hook (additive) ----
        try:
            await run_dispatch(db, evt.metadata["order_id"])
        except Exception as e:
            logger.warning(f"[dispatch] failed for order {evt.metadata['order_id']}: {e}")
    return {"received": True}


# ---------- AI Chatbot ----------
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402


@api.post("/chat")
async def chat(payload: ChatPayload, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # SEC-004: throttle per-user to bound LLM cost.
    chat_limiter.check_or_raise(user.user_id)
    session_id = payload.session_id or f"chat_{user.user_id}"
    rests = (await db.execute(
        select(Restaurant.name, Restaurant.cuisine).where(Restaurant.approved.is_(True)).limit(15)
    )).all()
    items = (await db.execute(
        select(MenuItem.name, MenuItem.price).where(MenuItem.available.is_(True)).limit(30)
    )).all()
    context = "Available restaurants: " + ", ".join(f"{r[0]} ({r[1] or ''})" for r in rests)
    context += "\nPopular items: " + ", ".join(f"{i[0]} (${i[1]})" for i in items[:15])

    sys_msg = (
        "You are Zoey, the friendly food concierge for ZoomEats — a curated food delivery marketplace. "
        "Help the user pick a restaurant or dish based on their mood, cuisine preference, dietary needs, or budget. "
        "Keep replies short (2-4 sentences), warm, and concrete: name 1-3 specific options from the list when possible. "
        f"Use only this menu context:\n{context}"
    )
    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=sys_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    reply = await chat_client.send_message(UserMessage(text=payload.text))

    db.add(ChatMessage(session_id=session_id, user_id=user.user_id, role="user", text=payload.text))
    db.add(ChatMessage(session_id=session_id, user_id=user.user_id, role="assistant", text=reply))
    await db.commit()
    return {"reply": reply, "session_id": session_id}


@api.get("/chat/history")
async def chat_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session_id = f"chat_{user.user_id}"
    res = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(asc(ChatMessage.created_at)).limit(200)
    )
    return [
        {"session_id": m.session_id, "role": m.role, "text": m.text, "created_at": to_iso(m.created_at)}
        for m in res.scalars().all()
    ]


# ---------- Admin ----------
@api.get("/admin/metrics")
async def admin_metrics(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    users_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    rests_count = (await db.execute(select(func.count()).select_from(Restaurant))).scalar() or 0
    orders_count = (await db.execute(select(func.count()).select_from(Order))).scalar() or 0
    paid_count = (await db.execute(select(func.count()).select_from(Order).where(Order.payment_status == "paid"))).scalar() or 0
    revenue = (await db.execute(select(func.coalesce(func.sum(Order.total), 0)).where(Order.payment_status == "paid"))).scalar() or 0
    return {
        "users": users_count, "restaurants": rests_count, "orders": orders_count,
        "paid_orders": paid_count, "revenue": round(float(revenue), 2),
    }


@api.get("/admin/users")
async def admin_users(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).order_by(desc(User.created_at)))
    return [user_dict(u) for u in res.scalars().all()]


@api.get("/admin/restaurants")
async def admin_restaurants(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Restaurant).order_by(desc(Restaurant.created_at)))
    return [rest_dict(r) for r in res.scalars().all()]


@api.post("/admin/restaurants/{rid}/approve")
async def admin_approve(rid: str, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Restaurant).where(Restaurant.restaurant_id == rid))).scalar_one_or_none()
    if r:
        r.approved = True
        await db.commit()
    return {"ok": True}


@api.get("/admin/orders")
async def admin_orders(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Order).order_by(desc(Order.created_at)).limit(500))
    return [order_dict(o) for o in res.scalars().all()]


@api.get("/admin/orders/{oid}/verify-receipt")
async def admin_verify_receipt(
    oid: str,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Re-hash the stored items JSONB and compare it to orders.price_hash.
    If anyone tampered with the items column directly in Postgres after order-create,
    the hashes won't match — useful for refund disputes and audit trails."""
    o = (await db.execute(select(Order).where(Order.order_id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Order not found")
    if not o.price_hash:
        # Legacy order created before price_hash was added — no receipt to verify
        return {
            "order_id": o.order_id,
            "stored_hash": None,
            "recomputed_hash": None,
            "match": None,
            "note": "Order pre-dates price_hash column; cannot verify.",
        }
    recomputed = compute_price_hash(o.items or [])
    return {
        "order_id": o.order_id,
        "stored_hash": o.price_hash,
        "recomputed_hash": recomputed,
        "match": recomputed == o.price_hash,
    }


@api.get("/admin/activity")
async def admin_activity(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    events: List[Dict[str, Any]] = []
    o_rows = (await db.execute(select(Order).order_by(desc(Order.created_at)).limit(30))).scalars().all()
    for o in o_rows:
        events.append({"type": "order", "title": f"Order ${o.total:.2f} · {o.restaurant_name}",
                       "description": f"{o.customer_name} · {o.status} · {o.payment_status}",
                       "when": to_iso(o.created_at), "id": o.order_id})
    u_rows = (await db.execute(select(User).order_by(desc(User.created_at)).limit(15))).scalars().all()
    for u in u_rows:
        events.append({"type": "signup", "title": f"New {u.role}: {u.name}",
                       "description": u.email, "when": to_iso(u.created_at), "id": u.user_id})
    r_rows = (await db.execute(select(Restaurant).order_by(desc(Restaurant.created_at)).limit(15))).scalars().all()
    for r in r_rows:
        events.append({"type": "restaurant", "title": f"Restaurant: {r.name}",
                       "description": f"{r.cuisine or ''} · {'approved' if r.approved else 'pending'}",
                       "when": to_iso(r.created_at), "id": r.restaurant_id})
    events.sort(key=lambda e: e["when"], reverse=True)
    return events[:30]


@api.get("/admin/attention")
async def admin_attention(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    pending_rows = (await db.execute(select(Restaurant).where(Restaurant.approved.is_(False)))).scalars().all()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    stuck_rows = (await db.execute(
        select(Order).where(and_(
            Order.payment_status == "paid",
            Order.status.in_(["placed", "accepted", "preparing", "ready", "picked_up"]),
            Order.created_at < cutoff,
        )).order_by(asc(Order.created_at))
    )).scalars().all()
    failed_rows = (await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.payment_status.notin_(["paid", "initiated"]))
        .order_by(desc(PaymentTransaction.created_at))
    )).scalars().all()
    return {
        "pending_restaurants": [rest_dict(r) for r in pending_rows],
        "stuck_orders": [order_dict(o) for o in stuck_rows],
        "failed_payments": [{"session_id": p.session_id, "order_id": p.order_id, "user_id": p.user_id,
                             "amount": p.amount, "currency": p.currency, "payment_status": p.payment_status,
                             "created_at": to_iso(p.created_at)} for p in failed_rows],
        "counts": {"pending": len(pending_rows), "stuck": len(stuck_rows), "failed": len(failed_rows)},
    }


@api.get("/metrics")
async def metrics_endpoint():
    """Expose Prometheus metrics if prometheus_client is installed."""
    try:
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    except Exception:
        raise HTTPException(status_code=404, detail="Metrics not available")
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


@api.post("/admin/audit/snapshot")
async def admin_audit_snapshot(user: User = Depends(require_role("admin"))):
    """Trigger an on-demand audit snapshot upload to S3 and return metadata."""
    try:
        res = await create_and_upload_snapshot()
        return res
    except Exception as e:
        logger.exception("on-demand snapshot failed: %s", e)
        raise HTTPException(500, "snapshot failed")


async def _compute_daily_stats(db: AsyncSession, today_start: datetime) -> Dict[str, Any]:
    """Aggregates today's platform stats — pure data layer (no LLM)."""
    todays_orders = (await db.execute(select(Order).where(Order.created_at >= today_start))).scalars().all()
    todays_paid = [o for o in todays_orders if o.payment_status == "paid"]
    new_users = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= today_start)
    )).scalar() or 0
    new_vendors = (await db.execute(
        select(func.count()).select_from(User).where(and_(User.created_at >= today_start, User.role == "vendor"))
    )).scalar() or 0
    new_restaurants = (await db.execute(
        select(func.count()).select_from(Restaurant).where(Restaurant.created_at >= today_start)
    )).scalar() or 0
    pending = (await db.execute(
        select(func.count()).select_from(Restaurant).where(Restaurant.approved.is_(False))
    )).scalar() or 0
    return {
        "todays_orders": todays_orders, "todays_paid": todays_paid,
        "gmv": round(sum(o.total for o in todays_paid), 2),
        "new_users": new_users, "new_vendors": new_vendors,
        "new_restaurants": new_restaurants, "pending_approvals": pending,
    }


def _top_performer(paid_orders: List[Order]) -> str:
    if not paid_orders:
        return "no orders yet"
    by_rest: Dict[str, float] = {}
    by_name: Dict[str, str] = {}
    for o in paid_orders:
        by_rest[o.restaurant_id] = by_rest.get(o.restaurant_id, 0) + o.total
        by_name[o.restaurant_id] = o.restaurant_name
    top_id = max(by_rest, key=by_rest.get)
    return f"{by_name[top_id]} (${by_rest[top_id]:.2f})"


def _digest_fallback(stats: Dict[str, Any], top_line: str) -> str:
    return (
        f"Quiet pulse today. {len(stats['todays_orders'])} orders placed, ${stats['gmv']:.2f} GMV, "
        f"{stats['new_restaurants']} new restaurant signup(s). "
        f"{'Top performer: ' + top_line + '. ' if stats['todays_paid'] else ''}"
        f"{stats['pending_approvals']} restaurant(s) awaiting your approval."
    )


@api.get("/admin/digest")
async def admin_digest(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    stats = await _compute_daily_stats(db, today_start)
    top_line = _top_performer(stats["todays_paid"])

    facts = (
        f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}\n"
        f"Orders today: {len(stats['todays_orders'])} (paid: {len(stats['todays_paid'])})\n"
        f"GMV today: ${stats['gmv']:.2f}\n"
        f"New users today: {stats['new_users']} (vendors: {stats['new_vendors']})\n"
        f"New restaurants today: {stats['new_restaurants']}\n"
        f"Top performer today: {top_line}\n"
        f"Restaurants awaiting approval: {stats['pending_approvals']}\n"
    )
    sys_msg = (
        "You are Zoey, the ZoomEats platform analyst. Given today's facts, write a tight 4-sentence digest "
        "for the platform owner: open with a one-line summary, then call out the top performer, then any "
        "issues or items needing attention, then a forward-looking nudge. Friendly, executive tone. No emojis. "
        "If GMV is $0 and orders are 0, frame it as 'quiet day so far' — not as a problem."
    )
    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"digest_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}",
        system_message=sys_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    try:
        text = await chat_client.send_message(UserMessage(text=facts))
    except Exception as e:
        logger.warning(f"Digest LLM error: {e}")
        text = _digest_fallback(stats, top_line)

    return {
        "digest": text,
        "stats": {
            "orders": len(stats["todays_orders"]), "paid_orders": len(stats["todays_paid"]),
            "gmv": stats["gmv"], "new_users": stats["new_users"], "new_vendors": stats["new_vendors"],
            "new_restaurants": stats["new_restaurants"], "top_performer": top_line,
            "pending_approvals": stats["pending_approvals"],
        },
    }


# ---------- Health ----------
@api.get("/")
async def root():
    return {"app": "ZoomEats", "db": "supabase-postgres", "status": "ok"}


# ---------- Seed data ----------
SEED_RESTAURANTS = [
    {
        "name": "Terra Verde", "cuisine": "Mediterranean",
        "description": "Coastal small plates, sun-soaked herbs, and stone-fired bread.",
        "image_url": "https://images.pexels.com/photos/1660030/pexels-photo-1660030.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "cover_url": "https://images.pexels.com/photos/5732798/pexels-photo-5732798.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "address": "12 Olive St", "rating": 4.8, "delivery_time_min": 28,
        "menu": [
            {"name": "Charcoal Sourdough", "price": 6.50, "category": "Starters",
             "image_url": "https://images.pexels.com/photos/1660030/pexels-photo-1660030.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Stone-fired with sea salt & olive oil."},
            {"name": "Lamb Tagine Plate", "price": 19.00, "category": "Mains",
             "image_url": "https://images.unsplash.com/photo-1624272823876-470c7f48c8c0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODh8MHwxfHNlYXJjaHwxfHxyZXN0YXVyYW50JTIwY2hlZiUyMHBsYXRpbmd8ZW58MHx8fHwxNzc3MTM3OTYwfDA&ixlib=rb-4.1.0&q=85",
             "description": "Slow-braised lamb, apricot, couscous."},
            {"name": "Citrus Olive Bowl", "price": 12.00, "category": "Mains",
             "image_url": "https://images.pexels.com/photos/5732798/pexels-photo-5732798.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Castelvetrano olives, blood orange, fennel."},
        ],
    },
    {
        "name": "Hachi Roll Co.", "cuisine": "Japanese",
        "description": "Hand-rolled sushi & rice bowls. Daily-fresh fish.",
        "image_url": "https://images.pexels.com/photos/34303216/pexels-photo-34303216.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "cover_url": "https://images.pexels.com/photos/34303216/pexels-photo-34303216.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "address": "44 Cedar Ave", "rating": 4.7, "delivery_time_min": 32,
        "menu": [
            {"name": "Premium Salmon Roll", "price": 14.00, "category": "Sushi",
             "image_url": "https://images.pexels.com/photos/34303216/pexels-photo-34303216.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Eight pieces, yuzu kosho aioli."},
            {"name": "Spicy Tuna Bowl", "price": 13.50, "category": "Bowls",
             "image_url": "https://images.pexels.com/photos/34303216/pexels-photo-34303216.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Sushi rice, avocado, scallion, sesame."},
            {"name": "Miso Glazed Eggplant", "price": 9.00, "category": "Sides",
             "image_url": "https://images.pexels.com/photos/34303216/pexels-photo-34303216.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Sweet white miso, charred."},
        ],
    },
    {
        "name": "Ember & Oak", "cuisine": "American",
        "description": "Wood-fired burgers and seasonal sides.",
        "image_url": "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "cover_url": "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "address": "8 Birch Rd", "rating": 4.6, "delivery_time_min": 25,
        "menu": [
            {"name": "Artisan Burger", "price": 15.00, "category": "Mains",
             "image_url": "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Dry-aged beef, smoked cheddar, brioche."},
            {"name": "Truffle Fries", "price": 7.50, "category": "Sides",
             "image_url": "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Crispy, parmesan, herb oil."},
            {"name": "Chocolate Stout Cake", "price": 8.00, "category": "Desserts",
             "image_url": "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
             "description": "Dark malt, salted caramel."},
        ],
    },
]


@app.on_event("startup")
async def seed_data():
    async with AsyncSessionLocal() as db:
        cnt = (await db.execute(select(func.count()).select_from(Restaurant))).scalar() or 0
        if cnt > 0:
            return
        owner_id = "user_demo_owner"
        existing_owner = (await db.execute(select(User).where(User.user_id == owner_id))).scalar_one_or_none()
        if not existing_owner:
            db.add(User(user_id=owner_id, email="demo.vendor@zoomeats.com", name="Demo Vendor", role="vendor"))
            await db.flush()
        for r in SEED_RESTAURANTS:
            rid = f"rest_{uuid.uuid4().hex[:10]}"
            db.add(Restaurant(
                restaurant_id=rid, owner_id=owner_id,
                name=r["name"], description=r["description"], cuisine=r["cuisine"],
                image_url=r["image_url"], cover_url=r["cover_url"], address=r["address"],
                rating=r["rating"], delivery_time_min=r["delivery_time_min"], approved=True,
            ))
            await db.flush()  # ensure restaurant FK is available for menu items
            for m in r["menu"]:
                db.add(MenuItem(item_id=f"item_{uuid.uuid4().hex[:10]}", restaurant_id=rid, available=True, **m))
        await db.commit()
        logger.info("Seeded demo restaurants & menu items into Supabase.")


# ---------- App wiring ----------
app.include_router(api)
app.include_router(agreements_router)
app.include_router(compliance_admin_router)
from uploads import router as uploads_router  # noqa: E402
app.include_router(uploads_router)
app.add_middleware(SecurityHeadersMiddleware)
# SEC-002: never combine credentials with `*`. If no explicit origins are configured,
# we drop credentials entirely (cookie-auth requests will fail cross-origin — by design).
app.add_middleware(
    CORSMiddleware,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_origins=CORS_ORIGINS or [],
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "DELETE", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)
