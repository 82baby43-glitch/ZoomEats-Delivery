import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import CriminalDisclosure
import agreements

logger = logging.getLogger("zoomeats.uploads")

S3_BUCKET = os.environ.get("ZOOMEATS_UPLOAD_BUCKET")
S3_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")

router = APIRouter(prefix="/api/uploads")

if S3_BUCKET:
    s3 = boto3.client("s3")
else:
    s3 = None


@router.post("/presign")
async def presign_upload(request: Request, filename: str, content_type: Optional[str] = "application/octet-stream", db: AsyncSession = Depends(get_db)):
    user = await agreements._get_current_user(request, db)
    if not s3:
        raise HTTPException(503, "S3 not configured")
    key = f"attachments/{user.user_id}/{uuid.uuid4().hex}_{filename}"
    try:
        url = s3.generate_presigned_url(
            'put_object',
            Params={'Bucket': S3_BUCKET, 'Key': key, 'ContentType': content_type},
            ExpiresIn=3600,
        )
    except ClientError as e:
        logger.warning(f"presign failed: {e}")
        raise HTTPException(500, "presign failed")
    return {"url": url, "key": key}


@router.post("/confirm")
async def confirm_upload(request: Request, disclosure_id: str, key: str, db: AsyncSession = Depends(get_db)):
    user = await agreements._get_current_user(request, db)
    # verify disclosure belongs to user
    disc = (await db.execute(select(CriminalDisclosure).where(CriminalDisclosure.disclosure_id == disclosure_id, CriminalDisclosure.user_id == user.user_id))).scalar_one_or_none()
    if not disc:
        raise HTTPException(404, "Disclosure not found")
    # append key to attachments
    attachments = disc.attachments or []
    attachments = list(attachments) if isinstance(attachments, list) else attachments
    attachments.append({"key": key, "uploaded_at": datetime.now(timezone.utc).isoformat()})
    disc.attachments = attachments
    await agreements.append_audit(db, user.user_id, user.user_id, "disclosure.attachment.add", before=None, after={"disclosure_id": disclosure_id, "key": key})
    await db.commit()
    return {"ok": True}
