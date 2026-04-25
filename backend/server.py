"""ZoomEats backend - food delivery marketplace."""
import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- Setup ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("zoomeats")

app = FastAPI(title="ZoomEats API")
api = APIRouter(prefix="/api")


# ---------- Models ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "customer"  # customer | vendor | delivery | admin
    created_at: datetime


class RoleUpdate(BaseModel):
    role: str


class Restaurant(BaseModel):
    restaurant_id: str
    owner_id: str
    name: str
    description: str = ""
    cuisine: str = ""
    image_url: str = ""
    cover_url: str = ""
    address: str = ""
    rating: float = 4.6
    delivery_time_min: int = 30
    approved: bool = True
    created_at: datetime


class RestaurantCreate(BaseModel):
    name: str
    description: str = ""
    cuisine: str = ""
    image_url: str = ""
    cover_url: str = ""
    address: str = ""


class MenuItem(BaseModel):
    item_id: str
    restaurant_id: str
    name: str
    description: str = ""
    price: float
    image_url: str = ""
    category: str = "Mains"
    available: bool = True


class MenuItemCreate(BaseModel):
    name: str
    description: str = ""
    price: float
    image_url: str = ""
    category: str = "Mains"


class CartLine(BaseModel):
    item_id: str
    name: str
    price: float
    quantity: int
    image_url: str = ""


class OrderCreate(BaseModel):
    restaurant_id: str
    items: List[CartLine]
    address: str
    notes: str = ""


class ChatMessage(BaseModel):
    text: str
    session_id: Optional[str] = None


# ---------- Auth helpers ----------
async def get_current_user(
    request: Request,
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    token = session_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: str):
    async def dep(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {roles}")
        return user
    return dep


# ---------- Auth routes ----------
@api.post("/auth/session")
async def auth_session(request: Request, response: Response):
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

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        role = existing.get("role", "customer")
        if email.lower() in ADMIN_EMAILS and role != "admin":
            role = "admin"
            await db.users.update_one({"user_id": user_id}, {"$set": {"role": "admin"}})
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        role = "admin" if email.lower() in ADMIN_EMAILS else "customer"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user}


@api.get("/auth/me")
async def auth_me(user: Dict[str, Any] = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def auth_logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


@api.post("/auth/role")
async def auth_set_role(payload: RoleUpdate, user: Dict[str, Any] = Depends(get_current_user)):
    if payload.role not in {"customer", "vendor", "delivery"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin role cannot be changed")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"role": payload.role}})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return updated


# ---------- Restaurants ----------
@api.get("/restaurants")
async def list_restaurants(q: Optional[str] = None, cuisine: Optional[str] = None):
    query: Dict[str, Any] = {"approved": True}
    if cuisine:
        query["cuisine"] = cuisine
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"cuisine": {"$regex": q, "$options": "i"}},
        ]
    restaurants = await db.restaurants.find(query, {"_id": 0}).to_list(200)
    return restaurants


@api.get("/restaurants/{rid}")
async def get_restaurant(rid: str):
    r = await db.restaurants.find_one({"restaurant_id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    items = await db.menu_items.find({"restaurant_id": rid, "available": True}, {"_id": 0}).to_list(200)
    return {"restaurant": r, "menu": items}


# ---------- Vendor ----------
@api.get("/vendor/restaurant")
async def vendor_get_restaurant(user=Depends(require_role("vendor"))):
    r = await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    return r


@api.post("/vendor/restaurant")
async def vendor_create_restaurant(payload: RestaurantCreate, user=Depends(require_role("vendor"))):
    existing = await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    if existing:
        await db.restaurants.update_one({"owner_id": user["user_id"]}, {"$set": payload.model_dump()})
        return await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    rid = f"rest_{uuid.uuid4().hex[:10]}"
    doc = {
        "restaurant_id": rid,
        "owner_id": user["user_id"],
        "rating": 4.6,
        "delivery_time_min": 30,
        "approved": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **payload.model_dump(),
    }
    await db.restaurants.insert_one(doc)
    return await db.restaurants.find_one({"restaurant_id": rid}, {"_id": 0})


@api.get("/vendor/menu-items")
async def vendor_list_menu(user=Depends(require_role("vendor"))):
    rest = await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    if not rest:
        return []
    return await db.menu_items.find({"restaurant_id": rest["restaurant_id"]}, {"_id": 0}).to_list(500)


@api.post("/vendor/menu-items")
async def vendor_add_menu(payload: MenuItemCreate, user=Depends(require_role("vendor"))):
    rest = await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    if not rest:
        raise HTTPException(400, "Create restaurant first")
    item = {
        "item_id": f"item_{uuid.uuid4().hex[:10]}",
        "restaurant_id": rest["restaurant_id"],
        "available": True,
        **payload.model_dump(),
    }
    await db.menu_items.insert_one(item)
    return await db.menu_items.find_one({"item_id": item["item_id"]}, {"_id": 0})


@api.delete("/vendor/menu-items/{item_id}")
async def vendor_del_menu(item_id: str, user=Depends(require_role("vendor"))):
    rest = await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    if not rest:
        raise HTTPException(404, "No restaurant")
    await db.menu_items.delete_one({"item_id": item_id, "restaurant_id": rest["restaurant_id"]})
    return {"ok": True}


@api.get("/vendor/orders")
async def vendor_list_orders(user=Depends(require_role("vendor"))):
    rest = await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    if not rest:
        return []
    return await db.orders.find({"restaurant_id": rest["restaurant_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/vendor/orders/{oid}/status")
async def vendor_update_order(oid: str, body: Dict[str, Any], user=Depends(require_role("vendor"))):
    new_status = body.get("status")
    if new_status not in {"accepted", "preparing", "ready"}:
        raise HTTPException(400, "Invalid status")
    rest = await db.restaurants.find_one({"owner_id": user["user_id"]}, {"_id": 0})
    res = await db.orders.update_one(
        {"order_id": oid, "restaurant_id": rest["restaurant_id"]},
        {"$set": {"status": new_status}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return {"ok": True}


# ---------- Orders (customer) ----------
@api.post("/orders")
async def create_order(payload: OrderCreate, user=Depends(get_current_user)):
    if not payload.items:
        raise HTTPException(400, "Empty cart")
    rest = await db.restaurants.find_one({"restaurant_id": payload.restaurant_id}, {"_id": 0})
    if not rest:
        raise HTTPException(404, "Restaurant not found")
    subtotal = round(sum(i.price * i.quantity for i in payload.items), 2)
    delivery_fee = 2.99
    total = round(subtotal + delivery_fee, 2)
    order_id = f"ord_{uuid.uuid4().hex[:10]}"
    doc = {
        "order_id": order_id,
        "customer_id": user["user_id"],
        "customer_name": user["name"],
        "restaurant_id": rest["restaurant_id"],
        "restaurant_name": rest["name"],
        "items": [i.model_dump() for i in payload.items],
        "subtotal": subtotal,
        "delivery_fee": delivery_fee,
        "total": total,
        "address": payload.address,
        "notes": payload.notes,
        "status": "pending_payment",  # pending_payment -> placed -> accepted -> preparing -> ready -> picked_up -> delivered
        "payment_status": "pending",
        "delivery_partner_id": None,
        "stripe_session_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(doc)
    return await db.orders.find_one({"order_id": order_id}, {"_id": 0})


@api.get("/orders/my")
async def my_orders(user=Depends(get_current_user)):
    return await db.orders.find({"customer_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/orders/{oid}")
async def get_order(oid: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"order_id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")
    if user["role"] == "admin" or o["customer_id"] == user["user_id"] or o.get("delivery_partner_id") == user["user_id"]:
        return o
    rest = await db.restaurants.find_one({"restaurant_id": o["restaurant_id"]}, {"_id": 0})
    if rest and rest["owner_id"] == user["user_id"]:
        return o
    raise HTTPException(403, "Forbidden")


# ---------- Delivery ----------
@api.get("/delivery/available")
async def delivery_available(user=Depends(require_role("delivery"))):
    return await db.orders.find(
        {"status": "ready", "delivery_partner_id": None}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)


@api.get("/delivery/my")
async def delivery_my(user=Depends(require_role("delivery"))):
    return await db.orders.find(
        {"delivery_partner_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)


@api.post("/delivery/orders/{oid}/{action}")
async def delivery_action(oid: str, action: str, user=Depends(require_role("delivery"))):
    o = await db.orders.find_one({"order_id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")

    if action == "accept":
        if o.get("delivery_partner_id"):
            raise HTTPException(400, "Already taken")
        await db.orders.update_one(
            {"order_id": oid},
            {"$set": {"delivery_partner_id": user["user_id"], "status": "picked_up"}},
        )
    elif action == "deliver":
        if o.get("delivery_partner_id") != user["user_id"]:
            raise HTTPException(403, "Not your delivery")
        await db.orders.update_one({"order_id": oid}, {"$set": {"status": "delivered"}})
    else:
        raise HTTPException(400, "Bad action")
    return {"ok": True}


# ---------- Stripe Payments ----------
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest
)


@api.post("/checkout/session")
async def create_checkout(body: Dict[str, Any], request: Request, user=Depends(get_current_user)):
    order_id = body.get("order_id")
    origin_url = body.get("origin_url")
    if not order_id or not origin_url:
        raise HTTPException(400, "order_id & origin_url required")
    o = await db.orders.find_one({"order_id": order_id, "customer_id": user["user_id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o.get("payment_status") == "paid":
        raise HTTPException(400, "Already paid")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    success_url = f"{origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/cart"

    req = CheckoutSessionRequest(
        amount=float(o["total"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"order_id": order_id, "user_id": user["user_id"]},
    )
    session = await sc.create_checkout_session(req)

    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "order_id": order_id,
        "user_id": user["user_id"],
        "amount": float(o["total"]),
        "currency": "usd",
        "payment_status": "initiated",
        "metadata": {"order_id": order_id, "user_id": user["user_id"]},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.orders.update_one({"order_id": order_id}, {"$set": {"stripe_session_id": session.session_id}})
    return {"url": session.url, "session_id": session.session_id}


@api.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user=Depends(get_current_user)):
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    try:
        status = await sc.get_checkout_status(session_id)
    except Exception as e:
        logger.warning(f"Stripe status lookup failed for {session_id}: {e}")
        # Soft-pending so frontend polling continues / falls back to webhook
        return {
            "status": "open",
            "payment_status": tx.get("payment_status", "pending") if tx else "pending",
            "amount_total": int(round((tx.get("amount", 0) if tx else 0) * 100)),
            "currency": tx.get("currency", "usd") if tx else "usd",
            "soft_error": True,
        }

    if tx and tx.get("payment_status") != "paid" and status.payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "status": status.status}},
        )
        order_id = tx.get("order_id")
        if order_id:
            await db.orders.update_one(
                {"order_id": order_id},
                {"$set": {"payment_status": "paid", "status": "placed"}},
            )
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    body = await request.body()
    try:
        evt = await sc.handle_webhook(body, request.headers.get("Stripe-Signature"))
    except Exception as e:
        logger.warning(f"Webhook error: {e}")
        return {"received": True}
    if evt.payment_status == "paid" and evt.metadata.get("order_id"):
        await db.orders.update_one(
            {"order_id": evt.metadata["order_id"]},
            {"$set": {"payment_status": "paid", "status": "placed"}},
        )
        await db.payment_transactions.update_one(
            {"session_id": evt.session_id},
            {"$set": {"payment_status": "paid"}},
        )
    return {"received": True}


# ---------- AI Chatbot ----------
from emergentintegrations.llm.chat import LlmChat, UserMessage


@api.post("/chat")
async def chat(payload: ChatMessage, user=Depends(get_current_user)):
    session_id = payload.session_id or f"chat_{user['user_id']}"
    # Pull a small list of restaurants/items to ground responses
    rests = await db.restaurants.find({"approved": True}, {"_id": 0, "name": 1, "cuisine": 1, "description": 1}).to_list(15)
    items = await db.menu_items.find({"available": True}, {"_id": 0, "name": 1, "price": 1, "category": 1}).to_list(30)
    context = "Available restaurants: " + ", ".join(f"{r['name']} ({r.get('cuisine','')})" for r in rests)
    context += "\nPopular items: " + ", ".join(f"{i['name']} (${i['price']})" for i in items[:15])

    sys_msg = (
        "You are Zoey, the friendly food concierge for ZoomEats — a curated food delivery marketplace. "
        "Help the user pick a restaurant or dish based on their mood, cuisine preference, dietary needs, or budget. "
        "Keep replies short (2-4 sentences), warm, and concrete: name 1-3 specific options from the list when possible. "
        f"Use only this menu context:\n{context}"
    )

    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=sys_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    reply = await chat_client.send_message(UserMessage(text=payload.text))

    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_many([
        {"session_id": session_id, "user_id": user["user_id"], "role": "user", "text": payload.text, "created_at": now},
        {"session_id": session_id, "user_id": user["user_id"], "role": "assistant", "text": reply, "created_at": now},
    ])
    return {"reply": reply, "session_id": session_id}


@api.get("/chat/history")
async def chat_history(user=Depends(get_current_user)):
    session_id = f"chat_{user['user_id']}"
    msgs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return msgs


# ---------- Admin ----------
@api.get("/admin/metrics")
async def admin_metrics(user=Depends(require_role("admin"))):
    paid = await db.orders.find({"payment_status": "paid"}, {"_id": 0, "total": 1}).to_list(10000)
    return {
        "users": await db.users.count_documents({}),
        "restaurants": await db.restaurants.count_documents({}),
        "orders": await db.orders.count_documents({}),
        "paid_orders": len(paid),
        "revenue": round(sum(o.get("total", 0) for o in paid), 2),
    }


@api.get("/admin/users")
async def admin_users(user=Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0}).to_list(500)


@api.get("/admin/restaurants")
async def admin_restaurants(user=Depends(require_role("admin"))):
    return await db.restaurants.find({}, {"_id": 0}).to_list(500)


@api.post("/admin/restaurants/{rid}/approve")
async def admin_approve(rid: str, user=Depends(require_role("admin"))):
    await db.restaurants.update_one({"restaurant_id": rid}, {"$set": {"approved": True}})
    return {"ok": True}


@api.get("/admin/orders")
async def admin_orders(user=Depends(require_role("admin"))):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


# ---------- Health ----------
@api.get("/")
async def root():
    return {"app": "ZoomEats", "status": "ok"}


# ---------- Seed data ----------
SEED_RESTAURANTS = [
    {
        "name": "Terra Verde",
        "cuisine": "Mediterranean",
        "description": "Coastal small plates, sun-soaked herbs, and stone-fired bread.",
        "image_url": "https://images.pexels.com/photos/1660030/pexels-photo-1660030.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "cover_url": "https://images.pexels.com/photos/5732798/pexels-photo-5732798.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "address": "12 Olive St",
        "rating": 4.8,
        "delivery_time_min": 28,
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
        "name": "Hachi Roll Co.",
        "cuisine": "Japanese",
        "description": "Hand-rolled sushi & rice bowls. Daily-fresh fish.",
        "image_url": "https://images.pexels.com/photos/34303216/pexels-photo-34303216.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "cover_url": "https://images.pexels.com/photos/34303216/pexels-photo-34303216.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "address": "44 Cedar Ave",
        "rating": 4.7,
        "delivery_time_min": 32,
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
        "name": "Ember & Oak",
        "cuisine": "American",
        "description": "Wood-fired burgers and seasonal sides.",
        "image_url": "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "cover_url": "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "address": "8 Birch Rd",
        "rating": 4.6,
        "delivery_time_min": 25,
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
    # Seed an admin "owner" user for the demo restaurants if needed
    existing = await db.restaurants.count_documents({})
    if existing == 0:
        owner_id = "user_demo_owner"
        await db.users.update_one(
            {"user_id": owner_id},
            {"$set": {
                "user_id": owner_id,
                "email": "demo.vendor@zoomeats.com",
                "name": "Demo Vendor",
                "picture": "",
                "role": "vendor",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        for r in SEED_RESTAURANTS:
            rid = f"rest_{uuid.uuid4().hex[:10]}"
            await db.restaurants.insert_one({
                "restaurant_id": rid,
                "owner_id": owner_id,
                "name": r["name"],
                "description": r["description"],
                "cuisine": r["cuisine"],
                "image_url": r["image_url"],
                "cover_url": r["cover_url"],
                "address": r["address"],
                "rating": r["rating"],
                "delivery_time_min": r["delivery_time_min"],
                "approved": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            for m in r["menu"]:
                await db.menu_items.insert_one({
                    "item_id": f"item_{uuid.uuid4().hex[:10]}",
                    "restaurant_id": rid,
                    "available": True,
                    **m,
                })
        logger.info("Seeded demo restaurants & menu items.")


# ---------- App wiring ----------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
