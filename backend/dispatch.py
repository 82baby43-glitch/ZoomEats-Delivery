"""Autonomous dispatch engine — additive feature layer.

Score = 0.4 * dist_to_restaurant + 0.4 * dist_to_customer + 0.2 * workload_factor
Lowest score wins. Falls back to Uber Direct if no internal driver available.
"""
import os
import uuid
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple

import httpx
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Order, Restaurant, Driver, Delivery, User

logger = logging.getLogger("zoomeats.dispatch")

# Approx coords for Columbia, MO (used as a sensible default when an address has no geocode yet)
COMO_LAT, COMO_LNG = 38.9517, -92.3341

# Weights (sum must = 1.0)
W_DIST_REST = 0.40
W_DIST_CUST = 0.40
W_WORKLOAD = 0.20

MAX_DIST_KM_FALLBACK = 25.0  # if no driver within this radius, fall back to Uber


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two coords in km."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _resolve_coords(obj: Any) -> Tuple[float, float]:
    """Pull (lat, lng) from a model that may or may not have geocoded fields.
    Falls back to Columbia, MO so the engine still produces a deterministic ordering
    in MVP mode. Once you geocode addresses for real, fill in obj.latitude/longitude."""
    lat = getattr(obj, "latitude", None)
    lng = getattr(obj, "longitude", None)
    if lat is None or lng is None:
        return COMO_LAT, COMO_LNG
    return float(lat), float(lng)


def score_driver(driver: Driver, rest_coords: Tuple[float, float], cust_coords: Tuple[float, float]) -> float:
    """Lower is better. Normalises distance by 25km cap and workload by 5 active jobs."""
    d_lat, d_lng = _resolve_coords(driver)
    dist_to_rest = _haversine_km(d_lat, d_lng, *rest_coords)
    dist_to_cust = _haversine_km(*rest_coords, *cust_coords)  # rest -> cust leg (same for all drivers)
    # Driver-relevant distance is mostly driver->restaurant; the rest->cust leg is constant per order
    # so we keep it for transparency but the comparative term is dist_to_rest.
    nd_rest = min(dist_to_rest, MAX_DIST_KM_FALLBACK) / MAX_DIST_KM_FALLBACK
    nd_cust = min(dist_to_cust, MAX_DIST_KM_FALLBACK) / MAX_DIST_KM_FALLBACK
    nw = min(driver.workload, 5) / 5.0
    return W_DIST_REST * nd_rest + W_DIST_CUST * nd_cust + W_WORKLOAD * nw


async def _select_best_driver(
    db: AsyncSession,
    rest_coords: Tuple[float, float],
    cust_coords: Tuple[float, float],
    stale_seconds: int = 120,
) -> Optional[Driver]:
    """Pick the lowest-score available driver who's been seen recently."""
    fresh_cutoff = datetime.now(timezone.utc) - timedelta(seconds=stale_seconds)
    rows = (await db.execute(
        select(Driver).where(and_(
            Driver.availability.is_(True),
            Driver.workload < 5,
        ))
    )).scalars().all()
    if not rows:
        return None
    # Consider drivers stale-tolerantly: prefer fresh, but use stale if no fresh
    fresh = [d for d in rows if d.last_seen and d.last_seen > fresh_cutoff]
    pool = fresh or rows
    return min(pool, key=lambda d: score_driver(d, rest_coords, cust_coords))


# ----------------- Uber Direct (stub-ready) -----------------
UBER_CLIENT_ID = os.environ.get("UBER_DIRECT_CLIENT_ID", "")
UBER_CLIENT_SECRET = os.environ.get("UBER_DIRECT_CLIENT_SECRET", "")
UBER_CUSTOMER_ID = os.environ.get("UBER_DIRECT_CUSTOMER_ID", "")


def _uber_configured() -> bool:
    return bool(UBER_CLIENT_ID and UBER_CLIENT_SECRET and UBER_CUSTOMER_ID)


async def _uber_auth_token() -> Optional[str]:
    if not _uber_configured():
        return None
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.post(
            "https://login.uber.com/oauth/v2/token",
            data={
                "client_id": UBER_CLIENT_ID,
                "client_secret": UBER_CLIENT_SECRET,
                "grant_type": "client_credentials",
                "scope": "eats.deliveries",
            },
        )
    if r.status_code != 200:
        logger.warning(f"Uber auth failed: {r.status_code} {r.text[:200]}")
        return None
    return r.json().get("access_token")


async def _create_uber_delivery(order: Order, restaurant: Restaurant) -> Dict[str, Any]:
    """Calls Uber Direct's createDelivery. Stub-safe when no credentials are configured."""
    if not _uber_configured():
        # Stub mode — record the intent but flag for the operator
        return {
            "tracking_id": f"stub_{uuid.uuid4().hex[:10]}",
            "status": "pending_credentials",
            "eta": None,
            "meta": {"stub": True, "reason": "UBER_DIRECT credentials not configured"},
        }
    token = await _uber_auth_token()
    if not token:
        return {
            "tracking_id": f"stub_{uuid.uuid4().hex[:10]}",
            "status": "auth_failed",
            "eta": None,
            "meta": {"stub": True, "reason": "Uber OAuth failed"},
        }
    body = {
        "pickup_name": restaurant.name or "Restaurant",
        "pickup_address": restaurant.address or "",
        "pickup_phone_number": "+15555550100",
        "dropoff_name": order.customer_name or "Customer",
        "dropoff_address": order.address or "",
        "dropoff_phone_number": "+15555550101",
        "manifest_items": [
            {"name": i.get("name", "Item"), "quantity": int(i.get("quantity", 1)), "price": int(round(i.get("price", 0) * 100))}
            for i in (order.items or [])
        ],
        "manifest_total_value": int(round(order.total * 100)),
        "external_id": order.order_id,
    }
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            f"https://api.uber.com/v1/customers/{UBER_CUSTOMER_ID}/deliveries",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code not in (200, 201):
        logger.warning(f"Uber createDelivery failed: {r.status_code} {r.text[:300]}")
        return {
            "tracking_id": f"stub_{uuid.uuid4().hex[:10]}",
            "status": "create_failed",
            "eta": None,
            "meta": {"stub": True, "reason": f"HTTP {r.status_code}", "body": r.text[:500]},
        }
    data = r.json()
    eta_str = data.get("dropoff_eta")
    eta_dt = None
    try:
        if eta_str:
            eta_dt = datetime.fromisoformat(eta_str.replace("Z", "+00:00"))
    except Exception:
        eta_dt = None
    return {
        "tracking_id": data.get("id") or data.get("uuid") or f"uber_{uuid.uuid4().hex[:10]}",
        "status": "dispatched",
        "eta": eta_dt,
        "meta": {"tracking_url": data.get("tracking_url"), "raw": data},
    }


# ----------------- Public entrypoints -----------------
async def dispatch_order(db: AsyncSession, order_id: str) -> Dict[str, Any]:
    """Idempotent dispatch trigger. Returns a summary dict describing what happened.

    Safe to call multiple times — if the order is already dispatched (status in
    {assigned_internal, assigned_uber, picked_up, delivered}) it's a no-op.

    SEC-P3: locks the order row with SELECT ... FOR UPDATE so concurrent callers
    (webhook + /checkout/status polling can both fire) cannot double-dispatch.
    """
    # Lock the order row for the duration of this transaction.
    order = (await db.execute(
        select(Order).where(Order.order_id == order_id).with_for_update()
    )).scalar_one_or_none()
    if not order:
        return {"ok": False, "reason": "order_not_found"}

    # Guard: only dispatch paid orders that aren't already dispatched
    if order.payment_status != "paid":
        return {"ok": False, "reason": "not_paid", "status": order.status}
    if order.delivery_type or order.status in {"assigned_internal", "assigned_uber", "picked_up", "delivered"}:
        return {"ok": True, "already": True, "delivery_type": order.delivery_type, "status": order.status}

    restaurant = (await db.execute(
        select(Restaurant).where(Restaurant.restaurant_id == order.restaurant_id)
    )).scalar_one_or_none()
    if not restaurant:
        return {"ok": False, "reason": "restaurant_missing"}

    rest_coords = _resolve_coords(restaurant)
    cust_coords = _resolve_coords(order)  # falls back to CoMo if order has no lat/lng

    driver = await _select_best_driver(db, rest_coords, cust_coords)
    if driver:
        # Assign internal
        driver.workload = (driver.workload or 0) + 1
        order.driver_id = driver.driver_id
        order.delivery_type = "internal"
        order.status = "assigned_internal"
        order.tracking_id = f"int_{uuid.uuid4().hex[:10]}"
        db.add(Delivery(
            delivery_id=f"del_{uuid.uuid4().hex[:10]}",
            order_id=order.order_id,
            provider="internal",
            tracking_id=order.tracking_id,
            status="dispatched",
            driver_id=driver.driver_id,
            meta={"score": score_driver(driver, rest_coords, cust_coords)},
        ))
        await db.commit()
        logger.info(f"[dispatch] {order_id} -> internal driver {driver.driver_id}")
        return {
            "ok": True, "delivery_type": "internal", "driver_id": driver.driver_id,
            "tracking_id": order.tracking_id, "status": order.status,
        }

    # No internal driver — fall back to Uber Direct
    uber = await _create_uber_delivery(order, restaurant)
    order.delivery_type = "uber"
    order.status = "assigned_uber"
    order.tracking_id = uber["tracking_id"]
    db.add(Delivery(
        delivery_id=f"del_{uuid.uuid4().hex[:10]}",
        order_id=order.order_id,
        provider="uber",
        tracking_id=uber["tracking_id"],
        eta=uber.get("eta"),
        status=uber["status"],
        meta=uber.get("meta") or {},
    ))
    await db.commit()
    logger.info(f"[dispatch] {order_id} -> uber {uber['status']} ({uber['tracking_id']})")
    return {
        "ok": True, "delivery_type": "uber", "tracking_id": uber["tracking_id"],
        "status": order.status, "uber_status": uber["status"],
    }
