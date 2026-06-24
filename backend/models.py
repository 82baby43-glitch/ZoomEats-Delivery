"""SQLAlchemy ORM models for ZoomEats."""
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    user_id = Column(String(64), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    picture = Column(Text, default="")
    role = Column(String(32), nullable=False, default="customer", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class UserSession(Base):
    __tablename__ = "user_sessions"
    session_token = Column(Text, primary_key=True)
    user_id = Column(String(64), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class Restaurant(Base):
    __tablename__ = "restaurants"
    restaurant_id = Column(String(64), primary_key=True)
    owner_id = Column(String(64), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    cuisine = Column(String(100), default="", index=True)
    image_url = Column(Text, default="")
    cover_url = Column(Text, default="")
    address = Column(Text, default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    address_validated = Column(Boolean, default=False, nullable=False)
    rating = Column(Float, default=4.6)
    delivery_time_min = Column(Integer, default=30)
    approved = Column(Boolean, default=False, index=True)  # SEC-003: new restaurants require admin approval
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class MenuItem(Base):
    __tablename__ = "menu_items"
    item_id = Column(String(64), primary_key=True)
    restaurant_id = Column(String(64), ForeignKey("restaurants.restaurant_id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    price = Column(Float, nullable=False)
    image_url = Column(Text, default="")
    category = Column(String(100), default="Mains")
    available = Column(Boolean, default=True)


class Order(Base):
    __tablename__ = "orders"
    order_id = Column(String(64), primary_key=True)
    customer_id = Column(String(64), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String(255), default="")
    restaurant_id = Column(String(64), ForeignKey("restaurants.restaurant_id", ondelete="SET NULL"), nullable=True, index=True)
    restaurant_name = Column(String(255), default="")
    items = Column(JSONB, nullable=False, default=list)
    subtotal = Column(Float, nullable=False, default=0.0)
    delivery_fee = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)
    address = Column(Text, default="")
    notes = Column(Text, default="")
    status = Column(String(32), nullable=False, default="pending_payment", index=True)
    payment_status = Column(String(32), nullable=False, default="pending", index=True)
    delivery_partner_id = Column(String(64), nullable=True, index=True)
    stripe_session_id = Column(Text, nullable=True)
    # Tamper-evident sha256 snapshot of canonical (repriced) cart items at order-create time.
    # Nullable for rows created before this column existed.
    price_hash = Column(String(64), nullable=True)
    # Cached customer dropoff coords — populated on first /tracking lookup, then reused.
    customer_lat = Column(Float, nullable=True)
    customer_lng = Column(Float, nullable=True)
    # Dispatch layer (additive, nullable for backward-compat)
    delivery_type = Column(String(16), nullable=True)   # 'internal' | 'uber' | None
    driver_id = Column(String(64), nullable=True, index=True)
    tracking_id = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"
    session_id = Column(Text, primary_key=True)
    order_id = Column(String(64), nullable=True, index=True)
    user_id = Column(String(64), nullable=True, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(8), nullable=False, default="usd")
    payment_status = Column(String(32), nullable=False, default="initiated", index=True)
    status = Column(String(32), default="")
    metadata_json = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(128), nullable=False, index=True)
    user_id = Column(String(64), nullable=False, index=True)
    role = Column(String(16), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


Index("ix_orders_status_created", Order.status, Order.created_at)
Index("ix_orders_customer_created", Order.customer_id, Order.created_at)


class Driver(Base):
    __tablename__ = "drivers"
    driver_id = Column(String(64), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    availability = Column(Boolean, nullable=False, default=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    workload = Column(Integer, nullable=False, default=0, index=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class Delivery(Base):
    __tablename__ = "deliveries"
    delivery_id = Column(String(64), primary_key=True)
    order_id = Column(String(64), ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(16), nullable=False)  # 'internal' | 'uber'
    tracking_id = Column(String(128), nullable=True)
    eta = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(32), nullable=False, default="pending")
    driver_id = Column(String(64), nullable=True, index=True)
    meta = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
