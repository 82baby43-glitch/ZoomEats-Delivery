import os
import json
import hmac
import hashlib
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any

try:
    import boto3
    from botocore.exceptions import ClientError
except Exception:
    boto3 = None
    ClientError = Exception
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AuditLog
from database import AsyncSessionLocal

logger = logging.getLogger("zoomeats.audit_exporter")

AUDIT_S3_BUCKET = os.environ.get("AUDIT_S3_BUCKET") or os.environ.get("ZOOMEATS_UPLOAD_BUCKET")
AUDIT_S3_PREFIX = os.environ.get("AUDIT_S3_PREFIX", "audit_snapshots")
AUDIT_SIGNING_KEY = os.environ.get("AUDIT_SIGNING_KEY")
AUDIT_SNAPSHOT_INTERVAL_MIN = int(os.environ.get("AUDIT_SNAPSHOT_INTERVAL_MIN", "60"))

s3 = None
if AUDIT_S3_BUCKET and boto3:
    try:
        s3 = boto3.client("s3")
    except Exception:
        s3 = None

# Optional Prometheus metrics
try:
    from prometheus_client import Counter, Histogram
    METRICS_ENABLED = True
    SNAPSHOT_COUNTER = Counter("zoomeats_audit_snapshots_total", "Audit snapshots total", ["status"])  # status=success|failure|skipped
    SNAPSHOT_DURATION = Histogram("zoomeats_audit_snapshot_duration_seconds", "Duration of audit snapshot generation and upload")
    SNAPSHOT_UPLOAD_ATTEMPTS = Counter("zoomeats_audit_snapshot_upload_attempts_total", "S3 upload attempts for audit snapshots")
    SNAPSHOT_UPLOAD_SUCCESS = Counter("zoomeats_audit_snapshot_upload_success_total", "S3 upload successes for audit snapshots")
except Exception:
    METRICS_ENABLED = False
    SNAPSHOT_COUNTER = SNAPSHOT_DURATION = SNAPSHOT_UPLOAD_ATTEMPTS = SNAPSHOT_UPLOAD_SUCCESS = None


async def compute_latest_chained_hash(db: AsyncSession) -> Optional[Dict[str, Any]]:
    res = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(1))
    last = res.scalars().first()
    if not last:
        return None
    return {"log_id": last.log_id, "timestamp": last.timestamp.isoformat(), "chained_hash": last.chained_hash}


def sign_payload(payload: Dict[str, Any]) -> str:
    if not AUDIT_SIGNING_KEY:
        raise RuntimeError("AUDIT_SIGNING_KEY not configured")
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    sig = hmac.new(AUDIT_SIGNING_KEY.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return sig


async def create_and_upload_snapshot() -> Dict[str, Any]:
    """Open a DB session, compute latest hash, sign snapshot, upload to S3."""
    async with AsyncSessionLocal() as db:
        info = await compute_latest_chained_hash(db)
        if not info:
            logger.info("No audit logs to snapshot")
            return {"ok": False, "reason": "no_logs"}
        snapshot = {
            "snapshot_at": datetime.now(timezone.utc).isoformat(),
            "latest": info,
            "tool": "zoomeats.audit_exporter",
        }
        try:
            signature = sign_payload(snapshot)
        except Exception as e:
            logger.exception("Signing snapshot failed: %s", e)
            if METRICS_ENABLED:
                SNAPSHOT_COUNTER.labels(status="failure").inc()
            return {"ok": False, "reason": "sign_failed"}
        envelope = {"snapshot": snapshot, "signature": signature}
        body = json.dumps(envelope).encode("utf-8")
        key = f"{AUDIT_S3_PREFIX}/snapshot_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{info['chained_hash'][:12]}.json"
        if not s3:
            logger.warning("S3 bucket not configured; skipping upload")
            if METRICS_ENABLED:
                SNAPSHOT_COUNTER.labels(status="skipped").inc()
            return {"ok": True, "uploaded": False, "snapshot": snapshot, "signature": signature}
        # Upload with retry/backoff
        max_retries = int(os.environ.get("AUDIT_S3_MAX_RETRIES", "3"))
        backoff_base = float(os.environ.get("AUDIT_S3_BACKOFF_SEC", "2"))
        last_err = None
        for attempt in range(1, max_retries + 1):
            try:
                if METRICS_ENABLED:
                    SNAPSHOT_UPLOAD_ATTEMPTS.inc()
                s3.put_object(Bucket=AUDIT_S3_BUCKET, Key=key, Body=body, ServerSideEncryption='AES256')
                duration = (datetime.now(timezone.utc) - start_ts).total_seconds()
                if METRICS_ENABLED:
                    SNAPSHOT_UPLOAD_SUCCESS.inc()
                    SNAPSHOT_DURATION.observe(duration)
                    SNAPSHOT_COUNTER.labels(status="success").inc()
                logger.info("Uploaded audit snapshot to s3://%s/%s (attempt %s)", AUDIT_S3_BUCKET, key, attempt)
                return {"ok": True, "uploaded": True, "s3_key": key, "snapshot": snapshot, "signature": signature, "attempts": attempt}
            except Exception as e:
                last_err = e
                logger.warning("Attempt %s: upload failed: %s", attempt, e)
                if attempt < max_retries:
                    wait = backoff_base * (2 ** (attempt - 1))
                    logger.info("Retrying in %.1f seconds...", wait)
                    await asyncio.sleep(wait)
        duration = (datetime.now(timezone.utc) - start_ts).total_seconds()
        if METRICS_ENABLED:
            SNAPSHOT_DURATION.observe(duration)
            SNAPSHOT_COUNTER.labels(status="failure").inc()
        logger.exception("Failed uploading snapshot after %s attempts: %s", max_retries, last_err)
        return {"ok": False, "reason": "upload_failed", "error": str(last_err), "attempts": max_retries}


_snapshot_task: Optional[asyncio.Task] = None


async def _snapshot_loop(interval_minutes: int):
    logger.info("Starting audit snapshot loop: every %s minutes", interval_minutes)
    try:
        while True:
            try:
                res = await create_and_upload_snapshot()
                logger.debug("snapshot result: %s", res)
            except Exception as e:
                logger.exception("snapshot iteration failed: %s", e)
            await asyncio.sleep(interval_minutes * 60)
    except asyncio.CancelledError:
        logger.info("Audit snapshot loop cancelled")
        raise


def start_background_snapshot(loop=None):
    global _snapshot_task
    if _snapshot_task and not _snapshot_task.done():
        return _snapshot_task
    if loop is None:
        loop = asyncio.get_event_loop()
    _snapshot_task = loop.create_task(_snapshot_loop(AUDIT_SNAPSHOT_INTERVAL_MIN))
    return _snapshot_task


def stop_background_snapshot():
    global _snapshot_task
    if _snapshot_task:
        _snapshot_task.cancel()
        _snapshot_task = None


if __name__ == "__main__":
    # allow manual trigger
    import asyncio
    asyncio.run(create_and_upload_snapshot())
