import os
import uuid
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Wallet, WalletTransaction, WalletPayout, User, Restaurant, Driver, Order

logger = logging.getLogger("zoomeats.wallet")

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
stripe.api_key = STRIPE_API_KEY

# Business-configurable splits. DRIVER and PLATFORM as fractions. RESTAURANT gets remainder.
PLATFORM_FEE_PCT = float(os.environ.get("ZOOM_PLATFORM_FEE_PCT", "0.20"))
DRIVER_PCT = float(os.environ.get("ZOOM_DRIVER_PCT", "0.60"))


def _cents(amount: float) -> int:
    return int(Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) * 100)


async def _get_or_create_wallet(db: AsyncSession, owner_user_id: str, owner_type: str) -> Wallet:
    w = (await db.execute(select(Wallet).where(Wallet.owner_user_id == owner_user_id))).scalar_one_or_none()
    if w:
        return w
    wid = f"w_{uuid.uuid4().hex[:12]}"
    w = Wallet(wallet_id=wid, owner_user_id=owner_user_id, owner_type=owner_type, available=0.0, pending=0.0)
    db.add(w)
    await db.flush()
    return w


async def credit_pending_for_order(db: AsyncSession, order: Order):
    """Credit pending balances when payment is captured/paid. Called when order.payment_status becomes 'paid'."""
    # compute splits
    total = float(order.total or 0.0)
    if total <= 0:
        return
    platform_pct = PLATFORM_FEE_PCT
    driver_pct = DRIVER_PCT
    restaurant_pct = max(0.0, 1.0 - platform_pct - driver_pct)

    driver_amount = round(total * driver_pct, 2)
    platform_amount = round(total * platform_pct, 2)
    restaurant_amount = round(total * restaurant_pct, 2)

    # ensure sums match total by adjusting platform
    diff = round(total - (driver_amount + platform_amount + restaurant_amount), 2)
    platform_amount += diff

    # Wallets: driver, restaurant (owner), platform
    # Driver
    if order.driver_id:
        drv = (await db.execute(select(Driver).where(Driver.driver_id == order.driver_id))).scalar_one_or_none()
        if drv:
            driver_user = (await db.execute(select(User).where(User.user_id == drv.user_id))).scalar_one_or_none()
            if driver_user:
                dw = await _get_or_create_wallet(db, driver_user.user_id, "driver")
                dw.pending = (dw.pending or 0.0) + driver_amount
                db.add(WalletTransaction(tx_id=f"tx_{uuid.uuid4().hex[:12]}", wallet_id=dw.wallet_id, order_id=order.order_id, amount=driver_amount, currency="usd", type="credit", status="pending", metadata={"role":"driver"}))
    else:
        # no driver -> platform keeps driver share
        platform_amount += driver_amount

    # Restaurant
    if order.restaurant_id:
        rest = (await db.execute(select(Restaurant).where(Restaurant.restaurant_id == order.restaurant_id))).scalar_one_or_none()
        if rest and rest.owner_id:
            rw = await _get_or_create_wallet(db, rest.owner_id, "restaurant")
            rw.pending = (rw.pending or 0.0) + restaurant_amount
            db.add(WalletTransaction(tx_id=f"tx_{uuid.uuid4().hex[:12]}", wallet_id=rw.wallet_id, order_id=order.order_id, amount=restaurant_amount, currency="usd", type="credit", status="pending", metadata={"role":"restaurant"}))
        else:
            platform_amount += restaurant_amount
    else:
        platform_amount += restaurant_amount

    # Platform
    pw = await _get_or_create_wallet(db, "platform", "platform")
    pw.pending = (pw.pending or 0.0) + platform_amount
    db.add(WalletTransaction(tx_id=f"tx_{uuid.uuid4().hex[:12]}", wallet_id=pw.wallet_id, order_id=order.order_id, amount=platform_amount, currency="usd", type="credit", status="pending", metadata={"role":"platform"}))

    await db.commit()


async def settle_pending_on_delivery(db: AsyncSession, order: Order):
    """Move pending wallet credits for an order to available when the order is delivered."""
    # fetch all wallet transactions for order that are pending
    res = await db.execute(select(WalletTransaction).where(WalletTransaction.order_id == order.order_id, WalletTransaction.status == "pending"))
    txs = res.scalars().all()
    for tx in txs:
        w = (await db.execute(select(Wallet).where(Wallet.wallet_id == tx.wallet_id))).scalar_one_or_none()
        if not w:
            continue
        # move amounts
        w.pending = max(0.0, (w.pending or 0.0) - float(tx.amount))
        w.available = (w.available or 0.0) + float(tx.amount)
        tx.status = "available"
        db.add(tx)
    await db.commit()


async def request_payout(db: AsyncSession, wallet: Wallet, amount: float, connected_account_id: Optional[str] = None) -> WalletPayout:
    """Attempt Stripe Connect instant payout from platform to connected account.
    This will create a WalletPayout row and a WalletTransaction of type 'payout'.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    if (wallet.available or 0.0) < amount:
        raise ValueError("insufficient available balance")

    payout = WalletPayout(payout_id=f"pout_{uuid.uuid4().hex[:12]}", wallet_id=wallet.wallet_id, amount=amount, currency="usd", status="initiated")
    db.add(payout)

    # create a payout tx and debit available immediately
    tx = WalletTransaction(tx_id=f"tx_{uuid.uuid4().hex[:12]}", wallet_id=wallet.wallet_id, order_id=None, amount=-abs(amount), currency="usd", type="payout", status="initiated", metadata={})
    wallet.available = (wallet.available or 0.0) - amount
    db.add(tx)
    await db.flush()

    # perform Stripe instant payout if connected_account_id provided
    if connected_account_id:
        try:
            stripe_resp = stripe.Payout.create(
                amount=_cents(amount),
                currency="usd",
                method="instant",
                stripe_account=connected_account_id,
            )
            payout.stripe_payout_id = getattr(stripe_resp, "id", None) or stripe_resp.get("id")
            payout.status = "submitted"
            tx.status = "completed"
            payout.created_at = payout.created_at
        except Exception as e:
            logger.warning(f"Stripe payout failed: {e}")
            payout.status = "failed"
            tx.status = "failed"
    else:
        # No connected account — mark as failed.
        payout.status = "failed"
        tx.status = "failed"
    await db.commit()
    return payout
