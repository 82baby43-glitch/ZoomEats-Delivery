import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, Depends, Request

from models import (
    Agreement, AgreementAcceptance, ElectronicSignature, CriminalDisclosure,
    ComplianceReview, AuditLog
)
from database import get_db
from models import UserSession, User

logger = logging.getLogger("zoomeats.agreements")

REQUIRED_FOR_ROLE = {
    "vendor": ["terms", "privacy", "restaurant_agreement", "electronic_records"],
    "delivery": ["terms", "privacy", "driver_agreement", "electronic_records"],
}


def utc_now():
    return datetime.now(timezone.utc)


async def append_audit(db: AsyncSession, user_id: Optional[str], actor_id: Optional[str], action_type: str, before: Optional[Dict[str, Any]], after: Optional[Dict[str, Any]], meta: Optional[Dict[str, Any]] = None):
    import hashlib, json

    # fetch last hash
    prev = None
    try:
        last = (await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(1))).scalars().first()
        prev = last.chained_hash if last and last.chained_hash else ""
    except Exception:
        prev = ""

    payload = {
        "user_id": user_id,
        "actor_id": actor_id,
        "action_type": action_type,
        "before": before or {},
        "after": after or {},
        "meta": meta or {},
        "timestamp": utc_now().isoformat(),
    }
    raw = (prev or "") + json.dumps(payload, sort_keys=True)
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()

    log = AuditLog(
        log_id=f"log_{uuid.uuid4().hex[:12]}",
        timestamp=utc_now(),
        user_id=user_id,
        actor_id=actor_id,
        action_type=action_type,
        before_state=before or {},
        after_state=after or {},
        meta=meta or {},
        chained_hash=h,
    )
    db.add(log)
    await db.flush()
    return log


async def has_required_acceptances(db: AsyncSession, user_id: str, role: str) -> bool:
    required = REQUIRED_FOR_ROLE.get(role, [])
    if not required:
        return True
    # fetch acceptances for user
    res = await db.execute(select(AgreementAcceptance).where(AgreementAcceptance.user_id == user_id))
    rows = res.scalars().all()
    accepted = {r.agreement_type + ":" + r.agreement_version for r in rows}
    # fetch latest agreement versions per type
    for typ in required:
        # require at least one acceptance with agreement_type == typ
        ok = any(r.agreement_type == typ and r.accepted for r in rows)
        if not ok:
            return False
    return True


# Endpoints
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/agreements")

class AcceptPayload(BaseModel):
    agreement_type: str
    agreement_id: Optional[str] = None
    agreement_version: Optional[str] = None
    typed_name: str
    consent_checkbox: bool = True
    device_info: Optional[str] = None


async def _get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    sess_token = request.cookies.get("session_token")
    if not sess_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sess = (await db.execute(select(UserSession).where(UserSession.session_token == sess_token))).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = (await db.execute(select(User).where(User.user_id == sess.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/accept")
async def accept_agreement(payload: AcceptPayload, request: Request, db: AsyncSession = Depends(get_db), user = Depends(_get_current_user)):
    # find agreement by id or latest by type+version
    if payload.agreement_id:
        agr = (await db.execute(select(Agreement).where(Agreement.agreement_id == payload.agreement_id))).scalar_one_or_none()
        if not agr:
            raise HTTPException(404, "Agreement not found")
    else:
        # pick latest by type
        res = await db.execute(select(Agreement).where(Agreement.agreement_type == payload.agreement_type).order_by(Agreement.effective_at.desc()))
        agr = res.scalars().first()
        if not agr:
            raise HTTPException(404, "Agreement not found")
    acc = AgreementAcceptance(
        acceptance_id=f"acc_{uuid.uuid4().hex[:12]}",
        user_id=user.user_id,
        agreement_id=agr.agreement_id,
        agreement_type=agr.agreement_type,
        agreement_version=agr.version,
        accepted=True,
        ip_address=request.client.host if request.client else None,
        device_info=payload.device_info,
        signature={"typed_name": payload.typed_name, "consent_checkbox": payload.consent_checkbox},
        created_at=utc_now(),
    )
    db.add(acc)
    await db.flush()
    sig = ElectronicSignature(
        signature_id=f"sig_{uuid.uuid4().hex[:12]}",
        acceptance_id=acc.acceptance_id,
        typed_name=payload.typed_name,
        consent_checkbox=payload.consent_checkbox,
        ip_address=request.client.host if request.client else None,
        device_fingerprint=None,
        created_at=utc_now(),
    )
    db.add(sig)
    await append_audit(db, user.user_id, user.user_id, "agreement.accept", before=None, after={"agreement_id": agr.agreement_id, "version": agr.version})
    await db.commit()
    return {"ok": True, "acceptance_id": acc.acceptance_id}


@router.get("/me")
async def my_acceptances(db: AsyncSession = Depends(get_db), user = Depends(_get_current_user)):
    res = await db.execute(select(AgreementAcceptance).where(AgreementAcceptance.user_id == user.user_id).order_by(AgreementAcceptance.created_at.desc()))
    rows = res.scalars().all()
    out = []
    for r in rows:
        out.append({
            "acceptance_id": r.acceptance_id,
            "agreement_type": r.agreement_type,
            "agreement_version": r.agreement_version,
            "accepted": r.accepted,
            "created_at": r.created_at.isoformat(),
        })
    return out


# Driver criminal disclosure
class DisclosurePayload(BaseModel):
    has_conviction: bool
    offense_type: Optional[str] = None
    severity: Optional[str] = None
    conviction_date: Optional[datetime] = None
    state: Optional[str] = None
    explanation: Optional[str] = None
    rehabilitation: Optional[str] = None
    attachments: Optional[Dict[str, Any]] = None


@router.post("/driver/disclosure")
async def submit_disclosure(payload: DisclosurePayload, db: AsyncSession = Depends(get_db), user = Depends(_get_current_user)):
    disc = CriminalDisclosure(
        disclosure_id=f"disc_{uuid.uuid4().hex[:12]}",
        user_id=user.user_id,
        has_conviction=payload.has_conviction,
        offense_type=payload.offense_type,
        severity=payload.severity,
        conviction_date=payload.conviction_date,
        state=payload.state,
        explanation=payload.explanation,
        rehabilitation=payload.rehabilitation,
        attachments=payload.attachments,
        created_at=utc_now(),
    )
    db.add(disc)
    # create a compliance review record and route to queue if needed
    review = ComplianceReview(
        review_id=f"rev_{uuid.uuid4().hex[:12]}",
        user_id=user.user_id,
        disclosure_id=disc.disclosure_id,
        status="pending" if payload.has_conviction else "approved",
        notes=None,
        assigned_to=None,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(review)
    await append_audit(db, user.user_id, user.user_id, "disclosure.submit", before=None, after={"disclosure_id": disc.disclosure_id, "review_id": review.review_id})
    await db.commit()
    return {"ok": True, "review_id": review.review_id, "status": review.status}


# Admin routes
admin_router = APIRouter(prefix="/api/admin/compliance")

@admin_router.get("/reviews")
async def list_reviews(db: AsyncSession = Depends(get_db), user = Depends(_get_current_user)):
    # require role check upstream in server registration
    res = await db.execute(select(ComplianceReview).order_by(ComplianceReview.created_at.desc()).limit(200))
    rows = res.scalars().all()
    out = []
    for r in rows:
        out.append({"review_id": r.review_id, "user_id": r.user_id, "status": r.status, "created_at": r.created_at.isoformat()})
    return out

class ReviewAction(BaseModel):
    action: str  # approve | reject | request_info | escalate
    notes: Optional[str] = None


@admin_router.post("/reviews/{rid}/action")
async def review_action(rid: str, payload: ReviewAction, db: AsyncSession = Depends(get_db), user = Depends(_get_current_user)):
    r = (await db.execute(select(ComplianceReview).where(ComplianceReview.review_id == rid))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Not found")
    before = {"status": r.status, "notes": r.notes}
    if payload.action == "approve":
        r.status = "approved"
    elif payload.action == "reject":
        r.status = "rejected"
    elif payload.action == "request_info":
        r.status = "more_info"
    elif payload.action == "escalate":
        r.status = "escalated"
    r.notes = (r.notes or "") + "\n" + (payload.notes or "")
    r.updated_at = utc_now()
    await append_audit(db, r.user_id, user.user_id, "review.action", before=before, after={"status": r.status, "notes": r.notes})
    await db.commit()
    return {"ok": True, "status": r.status}


# expose router for server to include
